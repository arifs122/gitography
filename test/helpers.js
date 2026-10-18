/**
 * Shared test helpers.
 *
 * Two families of helpers live here:
 *  - `commit()` / `dataset()` build synthetic input for `analyze()`, so the
 *    analysis and rendering tests are fast, deterministic and never touch git.
 *  - `createTempRepo()` builds a throwaway repository on disk for the
 *    end-to-end tests, and is skipped automatically when git is unavailable.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** @returns {boolean} */
export function gitAvailable() {
  try {
    const result = spawnSync('git', ['--version'], { encoding: 'utf8' });
    return !result.error && result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Build a commit object with the same shape `collect()` produces.
 * @param {{
 *   sha?: string, author?: string, email?: string, date?: string, subject?: string,
 *   files?: Array<string | { path: string, added?: number, deleted?: number, binary?: boolean }>,
 *   parents?: string[],
 * }} spec
 */
export function commit(spec = {}) {
  const sha = spec.sha ?? 'f'.repeat(40);
  const parents = spec.parents ?? [];
  const files = (spec.files ?? []).map((entry) => (typeof entry === 'string'
    ? { path: entry, added: 10, deleted: 2, binary: false }
    : { path: entry.path, added: entry.added ?? 10, deleted: entry.deleted ?? 2, binary: Boolean(entry.binary) }));

  const insertions = files.reduce((total, file) => total + file.added, 0);
  const deletions = files.reduce((total, file) => total + file.deleted, 0);

  return {
    sha,
    shortSha: sha.slice(0, 7),
    author: spec.author ?? 'Ada Lovelace',
    email: spec.email ?? 'ada@example.com',
    date: spec.date ?? '2023-01-15T22:30:00+03:00',
    parents,
    isMerge: parents.length > 1,
    subject: spec.subject ?? 'feat: add something',
    insertions,
    deletions,
    files,
    filesChanged: files.length,
    binaryFiles: files.filter((file) => file.binary).length,
    churn: insertions + deletions,
  };
}

/**
 * Build a dataset object matching `collect()`'s output.
 * @param {Array<object>} commits
 * @param {object} [overrides]
 */
export function dataset(commits, overrides = {}) {
  const files = overrides.files ?? [
    { path: 'src/index.js', size: 4096 },
    { path: 'src/util.js', size: 2048 },
    { path: 'README.md', size: 1024 },
    { path: 'assets/logo.png', size: 99999 },
  ];

  return {
    root: path.join(tmpdir(), 'gitography-synthetic'),
    name: 'demo',
    owner: 'acme',
    remoteUrl: null,
    remoteWebUrl: null,
    branch: 'main',
    head: 'a'.repeat(40),
    shortHead: 'aaaaaaa',
    isShallow: false,
    gitVersion: '2.40.0',
    commits,
    totalCommitsAll: commits.length,
    mergeCommitsAll: commits.filter((entry) => entry.isMerge).length,
    files,
    tags: { total: 2, latest: 'v1.0.0', recent: ['v1.0.0'] },
    branchCount: 1,
    scannedAt: '2024-06-01T12:00:00.000Z',
    warnings: [],
    ...overrides,
  };
}

/**
 * A three-commit, two-author, three-consecutive-day dataset.
 * Used by several suites, so the shape stays consistent.
 */
export function sampleDataset() {
  return dataset([
    commit({
      sha: '1'.repeat(40),
      author: 'Ada Lovelace',
      email: 'ada@example.com',
      date: '2023-01-15T22:30:00+03:00',
      subject: 'feat(api): add the thing',
      files: [{ path: 'src/index.js', added: 100, deleted: 5 }, { path: 'src/util.js', added: 10, deleted: 0 }],
    }),
    commit({
      sha: '2'.repeat(40),
      author: 'Ada Lovelace',
      email: 'ada@example.com',
      date: '2023-01-16T02:10:00+03:00',
      subject: 'fix: handle the edge case',
      files: [{ path: 'src/index.js', added: 3, deleted: 3 }],
    }),
    commit({
      sha: '3'.repeat(40),
      author: 'Grace Hopper',
      email: 'grace@example.com',
      date: '2023-01-17T09:00:00+03:00',
      subject: 'docs: document everything',
      files: [{ path: 'README.md', added: 40, deleted: 1 }],
    }),
  ]);
}

/**
 * Create a temporary git repository with real commits.
 * @param {Array<{ message?: string, file?: string, content?: string, date?: string, author?: string, email?: string }>} specs
 * @returns {{ dir: string, cleanup: () => void }}
 */
export function createTempRepo(specs) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gitography-test-'));

  const run = (args, extraEnv = {}) => {
    const result = spawnSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, ...extraEnv },
    });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
    }
    return result.stdout ?? '';
  };

  run(['init', '-q', '-b', 'main']);
  run(['config', 'user.name', 'Test User']);
  run(['config', 'user.email', 'test@example.com']);
  run(['config', 'commit.gpgsign', 'false']);
  run(['config', 'core.autocrlf', 'false']);

  specs.forEach((spec, index) => {
    const file = spec.file ?? `file-${index}.txt`;
    const absolute = path.join(dir, file);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, spec.content ?? `line ${index}\n`, 'utf8');
    run(['add', '-A']);
    run(['commit', '-q', '--no-gpg-sign', '-m', spec.message ?? `commit ${index}`], {
      GIT_AUTHOR_DATE: spec.date ?? `2023-01-${String(10 + index).padStart(2, '0')}T10:00:00+00:00`,
      GIT_COMMITTER_DATE: spec.date ?? `2023-01-${String(10 + index).padStart(2, '0')}T10:00:00+00:00`,
      GIT_AUTHOR_NAME: spec.author ?? 'Test User',
      GIT_AUTHOR_EMAIL: spec.email ?? 'test@example.com',
    });
  });

  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Create an empty directory that is definitely not a repository.
 * @returns {{ dir: string, cleanup: () => void }}
 */
export function createTempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gitography-plain-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/**
 * Capture helper for `run()`.
 * @returns {{ stdout: string, stderr: string, io: object }}
 */
export function capture() {
  const state = { stdout: '', stderr: '' };
  return {
    state,
    io: {
      stdout: (text) => { state.stdout += text; },
      stderr: (text) => { state.stderr += text; },
    },
  };
}
