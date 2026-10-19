/**
 * Git data collection layer.
 *
 * Everything gitography knows about a repository is gathered here through a
 * handful of `git` invocations. We shell out to the git binary (rather than
 * parsing .git by hand) because it stays correct across packfiles, worktrees,
 * shallow clones and weird encodings, and it is what every developer already
 * has installed.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

import { RECORD_SEP, FIELD_SEP, normalizePath } from './util.js';

/** Commit header format. Fields are separated by the ASCII unit separator. */
const LOG_FORMAT = `%x1e%H${FIELD_SEP}%an${FIELD_SEP}%ae${FIELD_SEP}%aI${FIELD_SEP}%P${FIELD_SEP}%s`;

const DEFAULT_MAX_BUFFER = 1024 * 1024 * 512; // 512 MB of stdout
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Expand a bare `YYYY-MM-DD` bound into an explicit time-of-day.
 *
 * Git parses dates with approxidate, which fills the fields a string leaves out
 * from the *current* clock. `--since=2023-02-01` therefore means "2023-02-01 at
 * whatever time it is right now", silently dropping that morning's commits.
 * A date-only filter should cover the whole day, so pin the boundary instead.
 *
 * @param {string} value raw CLI value
 * @param {'since' | 'until'} edge which end of the day to use
 * @returns {string}
 */
function expandDateBound(value, edge) {
  const match = /^(\d{4}-\d{2}-\d{2})$/.exec(value.trim());
  if (!match) return value;
  return `${match[1]}T${edge === 'until' ? '23:59:59' : '00:00:00'}`;
}

/**
 * Error type for anything git related, so the CLI can show a friendly message
 * instead of a stack trace.
 */
export class GitError extends Error {
  /**
   * @param {string} message
   * @param {{ args?: string[], stderr?: string, code?: number | null, cwd?: string }} [details]
   */
  constructor(message, details = {}) {
    super(message);
    this.name = 'GitError';
    this.args = details.args ?? [];
    this.stderr = details.stderr ?? '';
    this.code = details.code ?? null;
    this.cwd = details.cwd ?? null;
  }
}

/**
 * Run git and return trimmed stdout.
 *
 * @param {string} cwd
 * @param {string[]} args
 * @param {{ allowFailure?: boolean, encoding?: BufferEncoding, maxBuffer?: number, timeout?: number }} [options]
 * @returns {string}
 */
export function git(cwd, args, options = {}) {
  const {
    allowFailure = false,
    maxBuffer = DEFAULT_MAX_BUFFER,
    timeout = DEFAULT_TIMEOUT_MS,
  } = options;

  const result = spawnSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer,
    timeout,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_PAGER: 'cat',
      GIT_TERMINAL_PROMPT: '0',
      GIT_OPTIONAL_LOCKS: '0',
    },
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      throw new GitError(
        'The `git` executable was not found on your PATH.',
        { args, cwd },
      );
    }
    throw new GitError(`Failed to run git: ${result.error.message}`, { args, cwd });
  }

  const stdout = (result.stdout ?? '').replace(/\r\n/g, '\n');
  const stderr = (result.stderr ?? '').trim();

  if (result.status !== 0 && !allowFailure) {
    throw new GitError(
      stderr || `git ${args[0]} exited with code ${result.status}`,
      { args, stderr, code: result.status, cwd },
    );
  }

  return stdout.replace(/\n+$/, '');
}

/**
 * Best-effort git call: returns `null` instead of throwing.
 * @param {string} cwd
 * @param {string[]} args
 * @param {object} [options]
 * @returns {string | null}
 */
function gitOptional(cwd, args, options = {}) {
  try {
    const out = git(cwd, args, { ...options, allowFailure: true });
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a user supplied path to the working directory we should analyse.
 * Accepts a directory or a file inside a repository.
 * @param {string} input
 * @returns {string} absolute directory path
 */
export function resolveTarget(input) {
  const target = path.resolve(input || process.cwd());
  if (!existsSync(target)) {
    throw new GitError(`Path does not exist: ${target}`, { cwd: target });
  }
  return statSync(target).isDirectory() ? target : path.dirname(target);
}

/**
 * Find the repository root for a directory.
 * @param {string} dir
 * @returns {string | null}
 */
export function findRepositoryRoot(dir) {
  const out = gitOptional(dir, ['rev-parse', '--show-toplevel']);
  return out ? path.resolve(out) : null;
}

/**
 * Turn a git remote URL into a browsable https URL.
 * @param {string | null} remote
 * @returns {string | null}
 */
export function remoteToWebUrl(remote) {
  if (!remote) return null;
  let url = remote.trim();
  if (!url) return null;

  const scp = /^(?:[\w.-]+@)?([\w.-]+):(?!\/)(.+)$/.exec(url);
  if (scp && !url.includes('://')) {
    url = `https://${scp[1]}/${scp[2]}`;
  }
  url = url.replace(/^git\+/, '').replace(/^git:\/\//, 'https://');
  url = url.replace(/^ssh:\/\//, 'https://').replace(/^git@([^/]+):/, 'https://$1/');
  url = url.replace(/^(https?:\/\/)[^/@]+@/, '$1');
  url = url.replace(/\.git$/, '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(url)) return null;
  return url;
}

/**
 * Derive a friendly repository name.
 * @param {string} root
 * @param {string | null} remoteWebUrl
 * @returns {{ owner: string | null, name: string }}
 */
export function deriveRepositoryName(root, remoteWebUrl) {
  if (remoteWebUrl) {
    const parts = remoteWebUrl.replace(/\.git$/, '').split('/');
    const name = parts.pop() || '';
    const owner = parts.pop() || null;
    if (name) return { owner, name };
  }
  return { owner: null, name: path.basename(root) };
}

/**
 * Ask git whether a directory sits inside a work tree.
 * @param {string} dir
 * @returns {boolean}
 */
export function isRepository(dir) {
  const out = gitOptional(dir, ['rev-parse', '--is-inside-work-tree']);
  return out === 'true' || out === 'false';
}

/**
 * Decode a path that git chose to quote.
 *
 * Even with `core.quotepath=false`, git C-quotes paths containing control
 * characters (or a quote), so `"a\tb.js"` and `"src/\303\274.js"` arrive
 * escaped. We turn those back into real UTF-8 text.
 *
 * @param {string} raw
 * @returns {string}
 */
export function unquoteGitPath(raw) {
  const value = String(raw);
  if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) return value;

  const inner = value.slice(1, -1);
  const bytes = [];
  const escapes = { n: 0x0a, t: 0x09, r: 0x0d, '"': 0x22, '\\': 0x5c, a: 0x07, b: 0x08, f: 0x0c, v: 0x0b };

  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];
    if (char === '\\') {
      const octal = inner.slice(index + 1, index + 4);
      if (/^[0-7]{3}$/.test(octal)) {
        bytes.push(Number.parseInt(octal, 8));
        index += 3;
        continue;
      }
      const next = inner[index + 1];
      bytes.push(escapes[next] ?? next.charCodeAt(0));
      index += 1;
      continue;
    }
    for (const byte of Buffer.from(char, 'utf8')) bytes.push(byte);
  }

  return Buffer.from(bytes).toString('utf8');
}

/**
 * Parse raw `git log --numstat` output into commit records.
 *
 * @param {string} stdout
 * @returns {Array<object>} commits, newest first
 */
export function parseLog(stdout) {
  if (!stdout) return [];
  const commits = [];

  for (const chunk of stdout.split(RECORD_SEP)) {
    if (!chunk.trim()) continue;
    const newlineIndex = chunk.indexOf('\n');
    const header = newlineIndex === -1 ? chunk : chunk.slice(0, newlineIndex);
    const body = newlineIndex === -1 ? '' : chunk.slice(newlineIndex + 1);

    const fields = header.split(FIELD_SEP);
    if (fields.length < 6) continue;

    const [sha, author, email, date, parentsRaw, subject] = fields;
    if (!/^[0-9a-f]{7,40}$/i.test(sha)) continue;

    const parents = parentsRaw.trim() ? parentsRaw.trim().split(/\s+/) : [];

    let insertions = 0;
    let deletions = 0;
    let binaryFiles = 0;
    /** @type {Array<{path: string, added: number, deleted: number, binary: boolean}>} */
    const files = [];

    if (body) {
      for (const line of body.split('\n')) {
        if (!line) continue;
        const firstTab = line.indexOf('\t');
        if (firstTab === -1) continue;
        const secondTab = line.indexOf('\t', firstTab + 1);
        if (secondTab === -1) continue;

        const addedRaw = line.slice(0, firstTab);
        const deletedRaw = line.slice(firstTab + 1, secondTab);
        const filePath = normalizePath(unquoteGitPath(line.slice(secondTab + 1)));
        const binary = addedRaw === '-' || deletedRaw === '-';
        const added = binary ? 0 : Number(addedRaw) || 0;
        const deleted = binary ? 0 : Number(deletedRaw) || 0;

        if (binary) binaryFiles += 1;
        insertions += added;
        deletions += deleted;
        files.push({ path: filePath, added, deleted, binary });
      }
    }

    commits.push({
      sha,
      shortSha: sha.slice(0, 7),
      author: author || 'Unknown',
      email: (email || '').toLowerCase(),
      date,
      parents,
      isMerge: parents.length > 1,
      subject: subject || '',
      insertions,
      deletions,
      files,
      filesChanged: files.length,
      binaryFiles,
      churn: insertions + deletions,
    });
  }

  return commits;
}

/**
 * Parse `git ls-tree -r -l HEAD` output into file records with blob sizes.
 * @param {string} stdout
 * @returns {Array<{ path: string, size: number }>}
 */
export function parseTree(stdout) {
  if (!stdout) return [];
  const files = [];
  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const meta = line.slice(0, tab).split(/\s+/);
    const filePath = normalizePath(unquoteGitPath(line.slice(tab + 1)));
    // <mode> <type> <object> <size>\t<file>
    if (meta[1] !== 'blob') continue; // skip submodules and trees
    files.push({ path: filePath, size: Number(meta[3]) || 0 });
  }
  return files;
}

/**
 * Collect the entire dataset for a repository.
 *
 * @param {string} dir directory inside the repository
 * @param {{
 *   limit?: number,
 *   since?: string,
 *   until?: string,
 *   all?: boolean,
 *   includeMerges?: boolean,
 *   maxBuffer?: number,
 *   timeout?: number,
 * }} [options]
 * @returns {object} raw dataset consumed by `analyze()`
 */
export function collect(dir, options = {}) {
  const {
    limit = 25_000,
    since,
    until,
    all = false,
    includeMerges = true,
    maxBuffer = DEFAULT_MAX_BUFFER,
    timeout = DEFAULT_TIMEOUT_MS,
  } = options;

  const warnings = [];
  const runOptions = { maxBuffer, timeout };

  const root = findRepositoryRoot(dir);
  if (!root) {
    throw new GitError(
      `Not a git repository: ${dir}\nTip: run gitography inside a cloned repository, or pass a path to one.`,
      { cwd: dir },
    );
  }

  const remoteUrl = gitOptional(root, ['config', '--get', 'remote.origin.url'], runOptions);
  const remoteWebUrl = remoteToWebUrl(remoteUrl);
  const { owner, name } = deriveRepositoryName(root, remoteWebUrl);

  const gitVersion = gitOptional(root, ['--version'], runOptions);
  const branchRaw = gitOptional(root, ['branch', '--show-current'], runOptions);
  // `--verify --quiet` is important: in a freshly initialised repository
  // `git rev-parse HEAD` *prints "HEAD" to stdout* and exits non-zero, which
  // would otherwise look like a valid revision.
  const headRaw = gitOptional(root, ['rev-parse', '--verify', '--quiet', 'HEAD'], runOptions);
  const head = headRaw && /^[0-9a-f]{7,40}$/i.test(headRaw.trim()) ? headRaw.trim() : null;
  const branch = branchRaw || (head ? '(detached)' : null);
  const isShallow = gitOptional(root, ['rev-parse', '--is-shallow-repository'], runOptions) === 'true';

  if (head === null) {
    warnings.push(
      'This repository has no commits yet, so there is no history to visualise.',
    );
  }

  if (isShallow) {
    warnings.push(
      'This is a shallow clone, so history (and therefore the report) is incomplete. Run `git fetch --unshallow` for full results.',
    );
  }

  const args = ['log', '--numstat', '--no-renames', `--pretty=format:${LOG_FORMAT}`];
  if (limit > 0) args.push('-n', String(limit));
  if (since) args.push(`--since=${expandDateBound(since, 'since')}`);
  if (until) args.push(`--until=${expandDateBound(until, 'until')}`);
  if (all) args.push('--all');
  if (!includeMerges) args.push('--no-merges');

  let commits = [];
  if (head) {
    const stdout = git(root, args, runOptions);
    commits = parseLog(stdout);
    if (limit > 0 && commits.length === limit) {
      warnings.push(
        `Reached the commit scan limit (${limit.toLocaleString('en-US')}). Totals cover the most recent ${limit.toLocaleString('en-US')} commits only — raise it with --limit.`,
      );
    }
  }

  // Full commit counts, including merges, regardless of the scan window.
  const totalCommitsAll = head
    ? Number(gitOptional(root, ['rev-list', '--count', 'HEAD'], runOptions) || 0)
    : 0;
  const mergeCommitsAll = head
    ? Number(gitOptional(root, ['rev-list', '--count', '--merges', 'HEAD'], runOptions) || 0)
    : 0;

  const files = head ? parseTree(gitOptional(root, ['ls-tree', '-r', '-l', 'HEAD'], runOptions) || '') : [];

  const tags = (gitOptional(root, ['tag', '--sort=-creatordate'], runOptions) || '')
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);
  const branchCount = (gitOptional(root, ['branch', '-a', '--format=%(refname)'], runOptions) || '')
    .split('\n')
    .filter(Boolean).length;

  return {
    root,
    name,
    owner,
    remoteUrl,
    remoteWebUrl,
    branch: branch || 'unknown',
    head: head || null,
    shortHead: head ? head.slice(0, 7) : null,
    isShallow,
    gitVersion: gitVersion ? gitVersion.replace(/^git version /, '') : null,
    commits,
    totalCommitsAll,
    mergeCommitsAll,
    files,
    tags: { total: tags.length, latest: tags[0] || null, recent: tags.slice(0, 8) },
    branchCount,
    scannedAt: new Date().toISOString(),
    warnings,
  };
}

/**
 * Collect only the repository metadata (cheap; no history walk). Useful for
 * `--help`-style previews and for tests.
 * @param {string} dir
 * @returns {{ root: string, name: string, owner: string | null, remoteWebUrl: string | null }}
 */
export function collectIdentity(dir) {
  const root = findRepositoryRoot(dir);
  if (!root) return { root: '', name: path.basename(dir), owner: null, remoteWebUrl: null };
  const remoteWebUrl = remoteToWebUrl(gitOptional(root, ['config', '--get', 'remote.origin.url']));
  const { owner, name } = deriveRepositoryName(root, remoteWebUrl);
  return { root, name, owner, remoteWebUrl };
}
