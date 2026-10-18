/**
 * Command line interface for gitography.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { analyze } from './analyze.js';
import { collect, GitError, resolveTarget } from './collect.js';
import { renderHtml } from './render-html.js';
import { renderMarkdown } from './render-markdown.js';
import { renderText } from './render-text.js';
import { bold, cyan, dim, gray, green, paint, red, setColorEnabled, yellow } from './colors.js';
import { num } from './util.js';

const FORMATS = ['html', 'json', 'md', 'text'];

const HELP = `
  gitography — turn any Git repository into a beautiful, self-contained report

  Usage
    $ gitography [path] [options]

  Arguments
    path                     repository or any path inside one (default: .)

  Output
    -f, --format <fmt>       html | json | md | text          (default: html)
    -o, --output <file>      output path
                             (default: gitography-report.<ext> for html / json / md,
                              stdout when -o is omitted; text defaults to stdout too)
        --open               open the HTML report in your browser
        --theme <name>       dark | light                    (default: dark)
        --title <text>       override the report title
        --subtitle <text>    add a subtitle under the title

  Scan
        --limit <n>          maximum commits to scan          (default: 25000)
        --since <date>       only analyse commits after this date
        --until <date>       only analyse commits before this date
        --all                include every branch and ref (default: current HEAD)
        --no-merges          exclude merge commits from the analysis
        --top <n>            contributors and hotspots to show (default: 15 / 20)

  Misc
    -q, --quiet              suppress everything except errors
        --no-color           disable ANSI colours
    -h, --help               show this help
    -v, --version            show the version

  Examples
    $ npx gitography
    $ gitography ~/code/my-app --format md >> README.md
    $ gitography . --since 2024-01-01 --theme light --open
    $ gitography . --format json -o report.json
`;

/**
 * Parse `process.argv` style arguments.
 * @param {string[]} argv
 * @returns {{ options: Record<string, any>, errors: string[] }}
 */
export function parseArgs(argv) {
  const options = {
    target: '.',
    format: 'html',
    output: null,
    open: false,
    theme: 'dark',
    title: null,
    subtitle: null,
    limit: 25_000,
    since: null,
    until: null,
    all: false,
    includeMerges: true,
    top: null,
    hot: null,
    quiet: false,
    color: null,
    help: false,
    version: false,
  };
  const errors = [];
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const [flag, inlineValue] = arg.startsWith('--') && arg.includes('=')
      ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
      : [arg, null];

    const value = (name) => {
      if (inlineValue !== null) return inlineValue;
      const next = argv[i + 1];
      if (next === undefined || (next.startsWith('-') && next.length > 1 && !/^-\d/.test(next))) {
        errors.push(`Option ${name} requires a value.`);
        return null;
      }
      i += 1;
      return next;
    };

    switch (flag) {
      case '-h': case '--help': options.help = true; break;
      case '-v': case '--version': options.version = true; break;
      case '-q': case '--quiet': options.quiet = true; break;
      case '--open': options.open = true; break;
      case '--all': options.all = true; break;
      case '--no-merges': options.includeMerges = false; break;
      case '--no-color': options.color = false; break;
      case '--color': options.color = true; break;
      case '-f': case '--format': {
        const raw = value(flag);
        if (raw) options.format = raw.toLowerCase();
        break;
      }
      case '-o': case '--output': {
        const raw = value(flag);
        if (raw) options.output = raw;
        break;
      }
      case '--json': options.format = 'json'; break;
      case '--md': case '--markdown': options.format = 'md'; break;
      case '--theme': {
        const raw = value(flag);
        if (raw) options.theme = raw.toLowerCase();
        break;
      }
      case '--title': options.title = value(flag); break;
      case '--subtitle': options.subtitle = value(flag); break;
      case '--since': options.since = value(flag); break;
      case '--until': options.until = value(flag); break;
      case '--limit': options.limit = toInt(value(flag), 25_000, flag, errors); break;
      case '--top': options.top = toInt(value(flag), 15, flag, errors); break;
      case '--hot': options.hot = toInt(value(flag), 20, flag, errors); break;
      default: {
        if (flag.startsWith('-') && flag !== '-') errors.push(`Unknown option: ${flag}`);
        else positional.push(arg);
      }
    }
  }

  if (positional.length > 1) {
    errors.push(`Expected at most one path, received ${positional.length}: ${positional.join(', ')}`);
  }
  if (positional.length === 1) options.target = positional[0];

  if (!FORMATS.includes(options.format)) {
    errors.push(`Unknown format "${options.format}". Expected one of: ${FORMATS.join(', ')}.`);
  }
  if (options.theme !== 'dark' && options.theme !== 'light') {
    errors.push(`Unknown theme "${options.theme}". Expected dark or light.`);
  }

  return { options, errors };
}

/**
 * @param {string | null} raw
 * @param {number} fallback
 * @param {string} flag
 * @param {string[]} errors
 */
function toInt(raw, fallback, flag, errors) {
  if (raw === null || raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    errors.push(`Option ${flag} expects a positive integer, received "${raw}".`);
    return fallback;
  }
  return value;
}

/**
 * Default output path for a format.
 * @param {string} format
 * @param {string} cwd
 */
function defaultOutput(format, cwd) {
  const extension = { html: 'html', json: 'json', md: 'md', text: 'txt' }[format] ?? 'txt';
  return path.join(cwd, `gitography-report.${extension}`);
}

/**
 * Open a file with the operating system's default handler.
 * @param {string} file
 */
export function openInBrowser(file) {
  const platform = process.platform;
  const command = platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'open' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', file] : [file];
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * Run the CLI.
 * @param {string[]} argv
 * @param {{ cwd?: string, stdout?: (text: string) => void, stderr?: (text: string) => void }} [io]
 * @returns {number} exit code
 */
export function run(argv = process.argv.slice(2), io = {}) {
  const cwd = io.cwd ?? process.cwd();
  const write = io.stdout ?? ((text) => process.stdout.write(text));
  const writeErr = io.stderr ?? ((text) => process.stderr.write(text));

  const { options, errors } = parseArgs(argv);

  if (options.color !== null) setColorEnabled(options.color);
  else if (options.quiet) setColorEnabled(false);

  if (options.help) {
    write(`${HELP}\n`);
    return 0;
  }
  if (options.version) {
    write(`${readVersion()}\n`);
    return 0;
  }
  if (errors.length) {
    writeErr(`${red('gitography:')} ${errors[0]}\n${dim('Run `gitography --help` for usage.')}\n`);
    return 1;
  }

  const target = path.resolve(cwd, options.target);
  const started = Date.now();

  if (!options.quiet && options.format !== 'text') {
    writeErr(`${dim('gitography:')} scanning ${bold(path.basename(target) || target)}${dim('…')}\n`);
  }

  let report;
  try {
    const dataset = collect(resolveTarget(target), {
      limit: options.limit,
      since: options.since,
      until: options.until,
      all: options.all,
      includeMerges: options.includeMerges,
    });
    report = analyze(dataset, {
      topContributors: options.top ?? 15,
      topHotspots: options.hot ?? 20,
    });
  } catch (error) {
    if (error instanceof GitError) {
      writeErr(`${red('gitography:')} ${error.message}\n`);
      const firstStderrLine = error.stderr.split('\n')[0];
      if (firstStderrLine && firstStderrLine !== error.message) {
        writeErr(`${dim(firstStderrLine)}\n`);
      }
      return 2;
    }
    writeErr(`${red('gitography: unexpected error:')} ${error.message}\n`);
    if (process.env.GITOGRAPHY_DEBUG) writeErr(`${error.stack}\n`);
    return 2;
  }

  const scanMs = Date.now() - started;
  const command = `gitography ${argv.join(' ')}`.trim();

  if (options.format === 'text') {
    const text = `${renderText(report, { verbose: !options.quiet })}\n`;
    if (options.output) {
      const textPath = path.resolve(cwd, options.output);
      try {
        mkdirSync(path.dirname(textPath), { recursive: true });
        writeFileSync(textPath, text, 'utf8');
      } catch (error) {
        writeErr(`${red('gitography: could not write the report:')} ${error.message}\n`);
        return 2;
      }
      if (!options.quiet) writeErr(`${green('✓')} ${textPath}\n`);
    } else {
      write(text);
    }
    return 0;
  }

  if (options.format === 'json') {
    const payload = JSON.stringify({ ...report, meta: { scanMs, generatedAt: new Date().toISOString(), tool: 'gitography', version: readVersion() } }, null, 2);
    if (options.output) {
      writeFileSync(path.resolve(cwd, options.output), `${payload}\n`, 'utf8');
      if (!options.quiet) writeErr(`${green('✓')} ${path.resolve(cwd, options.output)}\n`);
    } else {
      write(`${payload}\n`);
    }
    return 0;
  }

  if (options.format === 'md') {
    const markdown = renderMarkdown(report, { embed: Boolean(options.output) });
    if (options.output) {
      writeFileSync(path.resolve(cwd, options.output), `${markdown}\n`, 'utf8');
      if (!options.quiet) writeErr(`${green('✓')} ${path.resolve(cwd, options.output)}\n`);
    } else {
      write(`${markdown}\n`);
    }
    return 0;
  }

  const outputPath = path.resolve(cwd, options.output ?? defaultOutput('html', cwd));
  const html = renderHtml(report, {
    theme: options.theme,
    title: options.title,
    subtitle: options.subtitle,
    command,
    generatedAt: new Date().toISOString(),
  });

  try {
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, html, 'utf8');
  } catch (error) {
    writeErr(`${red('gitography: could not write the report:')} ${error.message}\n`);
    return 2;
  }

  if (!options.quiet) {
    write(summary(report, scanMs, outputPath));
  }

  if (options.open) {
    const opened = openInBrowser(outputPath);
    if (!opened) writeErr(`${yellow('!')} Could not open the report automatically — open it manually.\n`);
  }

  return 0;
}

/**
 * Compact post-scan summary printed next to the written report.
 * @param {object} report
 * @param {number} scanMs
 * @param {string} outputPath
 */
function summary(report, scanMs, outputPath) {
  const totals = report.totals;
  const lines = [''];
  lines.push(`  ${bold('gitography')} ${dim('·')} ${bold(report.repository.name)}`);
  lines.push(`  ${dim('─'.repeat(46))}`);
  if (totals.commits === 0) {
    lines.push(`  ${yellow('No commits found.')}`);
  } else {
    lines.push(`  ${num(totals.commits)} commits ${dim('·')} ${num(totals.contributors)} contributors ${dim('·')} ${report.range.age}`);
    lines.push(`  ${green(`+${num(totals.insertions)}`)} ${dim('/')} ${paint(`-${num(totals.deletions)}`, 'red')} lines ${dim('·')} ${num(totals.filesTracked)} files`);
    const top = report.awards[0];
    if (top) lines.push(`  ${top.emoji} ${dim(`${top.title}:`)} ${top.headline}`);
  }
  lines.push(`  ${green('✓')} ${bold('Report')} ${dim('→')} ${cyan(outputPath)}`);
  lines.push(`  ${gray(`scanned in ${scanMs} ms`)}`);
  lines.push('');
  return lines.join('\n');
}

/** Read the package version without importing JSON (keeps ESM happy). */
export function readVersion() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(here, '..', 'package.json');
    if (existsSync(pkgPath)) {
      const json = JSON.parse(readFileSync(pkgPath, 'utf8'));
      return json.version ?? '0.0.0';
    }
  } catch {
    /* ignore */
  }
  return '0.0.0';
}

export { HELP, FORMATS };
