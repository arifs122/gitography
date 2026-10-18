import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collect,
  collectIdentity,
  deriveRepositoryName,
  findRepositoryRoot,
  GitError,
  isRepository,
  parseLog,
  parseTree,
  remoteToWebUrl,
  resolveTarget,
} from '../src/collect.js';
import { createTempDir, createTempRepo, gitAvailable } from './helpers.js';

const F = '\u001f';
const R = '\u001e';
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);

test('remoteToWebUrl normalises every common remote flavour', () => {
  assert.equal(remoteToWebUrl('git@github.com:acme/app.git'), 'https://github.com/acme/app');
  assert.equal(remoteToWebUrl('https://github.com/acme/app.git'), 'https://github.com/acme/app');
  assert.equal(remoteToWebUrl('https://github.com/acme/app'), 'https://github.com/acme/app');
  assert.equal(remoteToWebUrl('ssh://git@gitlab.com/acme/app.git'), 'https://gitlab.com/acme/app');
  assert.equal(remoteToWebUrl('git://github.com/acme/app.git'), 'https://github.com/acme/app');
  assert.equal(remoteToWebUrl('git+https://github.com/acme/app.git'), 'https://github.com/acme/app');
  assert.equal(remoteToWebUrl(''), null);
  assert.equal(remoteToWebUrl(null), null);
  assert.equal(remoteToWebUrl('not a url'), null);
});

test('deriveRepositoryName prefers the remote', () => {
  assert.deepEqual(
    deriveRepositoryName('/home/x/whatever', 'https://github.com/expressjs/express'),
    { owner: 'expressjs', name: 'express' },
  );
  assert.deepEqual(
    deriveRepositoryName('/home/x/my-app', null),
    { owner: null, name: 'my-app' },
  );
});

test('parseLog reads the framed git log output', () => {
  const stdout = [
    R + [SHA_A, 'Ada Lovelace', 'ada@example.com', '2023-01-15T22:30:00+03:00', '', 'Add feature'].join(F),
    '10\t2\tsrc/a.js',
    '5\t0\tsrc/b.js',
    '-\t-\tassets/logo.png',
    R + [SHA_B, 'Bob', 'bob@example.com', '2023-02-01T09:00:00Z', `${SHA_A} ${SHA_C}`, 'Merge pull request #12'].join(F),
  ].join('\n');

  const commits = parseLog(stdout);
  assert.equal(commits.length, 2);

  const [first, second] = commits;
  assert.equal(first.sha, SHA_A);
  assert.equal(first.shortSha, 'aaaaaaa');
  assert.equal(first.author, 'Ada Lovelace');
  assert.equal(first.email, 'ada@example.com');
  assert.equal(first.date, '2023-01-15T22:30:00+03:00');
  assert.equal(first.subject, 'Add feature');
  assert.equal(first.isMerge, false);
  assert.equal(first.filesChanged, 3);
  assert.equal(first.insertions, 15);
  assert.equal(first.deletions, 2);
  assert.equal(first.binaryFiles, 1);
  assert.equal(first.churn, 17);
  assert.equal(first.files[1].path, 'src/b.js');

  assert.equal(second.isMerge, true);
  assert.deepEqual(second.parents, [SHA_A, SHA_C]);
  assert.equal(second.filesChanged, 0);
  assert.equal(second.subject, 'Merge pull request #12');
});

test('parseLog survives junk and empty input', () => {
  assert.deepEqual(parseLog(''), []);
  assert.deepEqual(parseLog('\n\n'), []);
  assert.deepEqual(parseLog(`${R}not-framed-properly`), []);
  assert.deepEqual(parseLog(`${R}zzz${F}name${F}e@x${F}2023-01-01T00:00:00Z${F}${F}subject`), []);
});

test('parseTree skips submodules and keeps blob sizes', () => {
  const stdout = [
    '100644 blob abc1234567 4096\tsrc/a.js',
    '100755 blob def7654321 100\tbin/run.sh',
    '160000 commit aaa1111111 -\tvendor/submodule',
  ].join('\n');

  const files = parseTree(stdout);
  assert.equal(files.length, 2);
  assert.deepEqual(files[0], { path: 'src/a.js', size: 4096 });
  assert.deepEqual(files[1], { path: 'bin/run.sh', size: 100 });
  assert.deepEqual(parseTree(''), []);
});

test('resolveTarget rejects missing paths and accepts files', () => {
  assert.throws(() => resolveTarget('C:/definitely/not/here/at/all'), GitError);
  const { dir, cleanup } = createTempDir();
  try {
    assert.equal(resolveTarget(dir), dir.replace(/[\\/]$/, ''));
  } finally {
    cleanup();
  }
});

test('collect reports a helpful error outside a repository', () => {
  const { dir, cleanup } = createTempDir();
  try {
    assert.equal(isRepository(dir), false);
    assert.equal(findRepositoryRoot(dir), null);
    assert.throws(() => collect(dir), (error) => {
      assert.ok(error instanceof GitError);
      assert.match(error.message, /Not a git repository/);
      return true;
    });
    assert.deepEqual(collectIdentity(dir).name, dir.split(/[\\/]/).pop());
  } finally {
    cleanup();
  }
});

test('collect reads a real repository end to end', { skip: !gitAvailable() }, () => {
  const repo = createTempRepo([
    { message: 'feat: first', file: 'src/a.js', content: 'one\ntwo\n' },
    { message: 'fix: second', file: 'src/a.js', content: 'one\ntwo\nthree\n' },
    { message: 'docs: third', file: 'README.md', content: '# hello\n' },
  ]);

  try {
    assert.equal(isRepository(repo.dir), true);

    const data = collect(repo.dir);
    assert.equal(data.commits.length, 3);
    assert.equal(data.totalCommitsAll, 3);
    assert.equal(data.branch, 'main');
    assert.equal(data.shortHead.length, 7);
    assert.equal(data.isShallow, false);
    assert.ok(data.gitVersion);
    assert.ok(data.commits[0].files.length >= 1);
    assert.ok(data.files.some((file) => file.path === 'src/a.js'));
    assert.ok(data.files.every((file) => typeof file.size === 'number'));

    // Newest first, and the subjects survive the round trip.
    assert.equal(data.commits[0].subject, 'docs: third');
    assert.equal(data.commits[2].subject, 'feat: first');
  } finally {
    repo.cleanup();
  }
});

test('collect honours --since, --until, --limit and --no-merges', { skip: !gitAvailable() }, () => {
  const repo = createTempRepo([
    { message: 'one', file: 'a.txt', content: '1\n', date: '2023-01-01T10:00:00+00:00' },
    { message: 'two', file: 'b.txt', content: '2\n', date: '2023-02-01T10:00:00+00:00' },
    { message: 'three', file: 'c.txt', content: '3\n', date: '2023-03-01T10:00:00+00:00' },
  ]);

  try {
    assert.equal(collect(repo.dir, { since: '2023-02-01' }).commits.length, 2);
    assert.equal(collect(repo.dir, { until: '2023-02-15' }).commits.length, 2);
    assert.equal(collect(repo.dir, { limit: 1 }).commits.length, 1);
    assert.equal(collect(repo.dir, { includeMerges: false }).commits.length, 3);
    assert.equal(collect(repo.dir, { all: true }).commits.length, 3);
  } finally {
    repo.cleanup();
  }
});
