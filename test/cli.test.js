import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseArgs, readVersion, run } from '../src/cli.js';
import { capture, createTempDir, createTempRepo, gitAvailable } from './helpers.js';

const packageDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('parseArgs applies defaults', () => {
  const { options, errors } = parseArgs([]);
  assert.deepEqual(errors, []);
  assert.equal(options.target, '.');
  assert.equal(options.format, 'html');
  assert.equal(options.theme, 'dark');
  assert.equal(options.limit, 25_000);
  assert.equal(options.includeMerges, true);
  assert.equal(options.all, false);
  assert.equal(options.open, false);
});

test('parseArgs understands the flag vocabulary', () => {
  const { options, errors } = parseArgs([
    'some/path',
    '--format', 'md',
    '--theme=light',
    '--limit', '10',
    '--top', '5',
    '--hot', '7',
    '--since', '2024-01-01',
    '--until=2024-06-01',
    '--all',
    '--no-merges',
    '--open',
    '--quiet',
    '--no-color',
    '-o', 'out.md',
  ]);

  assert.deepEqual(errors, []);
  assert.equal(options.target, 'some/path');
  assert.equal(options.format, 'md');
  assert.equal(options.theme, 'light');
  assert.equal(options.limit, 10);
  assert.equal(options.top, 5);
  assert.equal(options.hot, 7);
  assert.equal(options.since, '2024-01-01');
  assert.equal(options.until, '2024-06-01');
  assert.equal(options.all, true);
  assert.equal(options.includeMerges, false);
  assert.equal(options.open, true);
  assert.equal(options.quiet, true);
  assert.equal(options.color, false);
  assert.equal(options.output, 'out.md');
});

test('parseArgs shorthands map to json and markdown', () => {
  assert.equal(parseArgs(['--json']).options.format, 'json');
  assert.equal(parseArgs(['--md']).options.format, 'md');
  assert.equal(parseArgs(['--markdown']).options.format, 'md');
  assert.equal(parseArgs(['-f', 'text']).options.format, 'text');
});

test('parseArgs reports bad input instead of throwing', () => {
  assert.match(parseArgs(['--nope']).errors[0], /Unknown option/);
  assert.match(parseArgs(['--format', 'pdf']).errors[0], /Unknown format/);
  assert.match(parseArgs(['--theme', 'neon']).errors[0], /Unknown theme/);
  assert.match(parseArgs(['--limit', 'abc']).errors[0], /positive integer/);
  assert.match(parseArgs(['--limit', '-3']).errors[0], /positive integer/);
  assert.match(parseArgs(['a', 'b']).errors[0], /at most one path/);
  assert.match(parseArgs(['--output']).errors[0], /requires a value/);
});

test('readVersion matches package.json', () => {
  const version = readVersion();
  assert.equal(version, '0.1.0');

  const pkg = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  assert.equal(pkg.version, version);
  assert.equal(pkg.bin.gitography, 'bin/gitography.js');
  assert.equal(pkg.type, 'module');
  assert.deepEqual(pkg.dependencies ?? {}, {});
});

test('--help and --version short-circuit', () => {
  const help = capture();
  assert.equal(run(['--help'], help.io), 0);
  assert.ok(help.state.stdout.includes('Usage'));
  assert.ok(help.state.stdout.includes('--format'));

  const version = capture();
  assert.equal(run(['--version'], version.io), 0);
  assert.ok(version.state.stdout.includes('0.1.0'));
});

test('bad arguments exit with code 1 and print to stderr', () => {
  const io = capture();
  assert.equal(run(['--format', 'pdf'], io.io), 1);
  assert.match(io.state.stderr, /Unknown format/);
  assert.equal(io.state.stdout, '');
});

test('scanning something that is not a repository fails cleanly', () => {
  const plain = createTempDir();
  try {
    const io = capture();
    const code = run(['.'], { ...io.io, cwd: plain.dir });
    assert.equal(code, 2);
    assert.match(io.state.stderr, /Not a git repository/);
    assert.equal(io.state.stderr.includes('at '), false, 'no stack trace leaked');
  } finally {
    plain.cleanup();
  }
});

test('--format text prints the terminal report to stdout', { skip: !gitAvailable() }, () => {
  const repo = createTempRepo([{ message: 'feat: first', file: 'a.txt' }]);
  try {
    const io = capture();
    const code = run(['--format', 'text', '--no-color'], { ...io.io, cwd: repo.dir });
    assert.equal(code, 0);
    assert.ok(io.state.stdout.includes('gitography'));
    assert.ok(io.state.stdout.includes('1 commits'));
    assert.equal(io.state.stdout.includes('\u001b['), false);
  } finally {
    repo.cleanup();
  }
});

test('--format json prints parseable JSON', { skip: !gitAvailable() }, () => {
  const repo = createTempRepo([
    { message: 'feat: one', file: 'a.txt' },
    { message: 'fix: two', file: 'a.txt', content: 'changed\n' },
  ]);
  try {
    const io = capture();
    const code = run(['--format', 'json'], { ...io.io, cwd: repo.dir });
    assert.equal(code, 0);

    const parsed = JSON.parse(io.state.stdout);
    assert.equal(parsed.totals.commits, 2);
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.meta.tool, 'gitography');
    assert.equal(parsed.meta.version, '0.1.0');
    assert.equal(typeof parsed.meta.scanMs, 'number');
    assert.equal(parsed.repository.branch, 'main');
  } finally {
    repo.cleanup();
  }
});

test('--format html writes a self-contained report file', { skip: !gitAvailable() }, () => {
  const repo = createTempRepo([{ message: 'feat: only', file: 'a.txt' }]);
  try {
    const io = capture();
    const code = run(['--format', 'html', '-o', 'report.html'], { ...io.io, cwd: repo.dir });
    assert.equal(code, 0);

    const output = path.join(repo.dir, 'report.html');
    assert.equal(existsSync(output), true);
    const html = readFileSync(output, 'utf8');
    assert.ok(html.startsWith('<!doctype html>'));
    assert.ok(html.includes('feat: only'));
    assert.equal(/<script[^>]+src=/i.test(html), false);
    assert.ok(io.state.stdout.includes('report.html'));

    // Default output name when -o is omitted.
    run(['--quiet'], { ...io.io, cwd: repo.dir });
    assert.equal(existsSync(path.join(repo.dir, 'gitography-report.html')), true);
  } finally {
    repo.cleanup();
  }
});

test('--format text can also write to a file', { skip: !gitAvailable() }, () => {
  const repo = createTempRepo([{ message: 'feat: file output', file: 'a.txt' }]);
  try {
    const io = capture();
    const code = run(['--format', 'text', '-o', 'summary.txt'], { ...io.io, cwd: repo.dir });
    assert.equal(code, 0);
    const written = readFileSync(path.join(repo.dir, 'summary.txt'), 'utf8');
    assert.ok(written.includes('gitography'));
    assert.ok(written.includes('file output') === false);
    assert.ok(written.includes('1 commits'));
  } finally {
    repo.cleanup();
  }
});

test('--format md without -o streams markdown to stdout', { skip: !gitAvailable() }, () => {
  const repo = createTempRepo([{ message: 'feat: streaming', file: 'a.txt' }]);
  try {
    const io = capture();
    assert.equal(run(['--format', 'md'], { ...io.io, cwd: repo.dir }), 0);
    assert.ok(io.state.stdout.includes('| Commits | 1 |'));
  } finally {
    repo.cleanup();
  }
});

test('a missing path exits with code 2 and a helpful message', () => {
  const io = capture();
  const code = run(['./definitely-not-here'], { ...io.io, cwd: process.cwd() });
  assert.equal(code, 2);
  assert.match(io.state.stderr, /Path does not exist/);
});
