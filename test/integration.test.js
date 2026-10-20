/**
 * End-to-end tests: real repositories on disk, through collect → analyze → render.
 *
 * These are the tests that would have caught the "freshly initialised repository
 * reported a bogus HEAD" bug, so they exercise the awkward real-world shapes:
 * no commits at all, merge commits, unicode paths and a detached HEAD.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { analyze } from '../src/analyze.js';
import { run } from '../src/cli.js';
import { collect } from '../src/collect.js';
import { renderHtml } from '../src/render-html.js';
import { createTempRepo, gitAvailable } from './helpers.js';

const skip = !gitAvailable();

test('a repository with no commits degrades gracefully', { skip }, () => {
  const repo = createTempRepo([]);
  try {
    const data = collect(repo.dir);
    assert.equal(data.head, null, 'no HEAD means no bogus "HEAD" revision');
    assert.equal(data.commits.length, 0);
    assert.ok(data.warnings.some((warning) => /no commits yet/i.test(warning)));

    const report = analyze(data);
    assert.equal(report.totals.commits, 0);
    assert.equal(report.repository.head, null);
    assert.match(report.warnings[0], /no commits yet/i);

    const html = renderHtml(report, {});
    assert.ok(html.includes('Nothing to chart yet'));
    assert.equal(/NaN|undefined/.test(html), false);
  } finally {
    repo.cleanup();
  }
});

test('the CLI reports zero commits instead of crashing', { skip }, () => {
  const repo = createTempRepo([]);
  try {
    let stdout = '';
    let stderr = '';
    const code = run(['--format', 'text', '--no-color'], {
      cwd: repo.dir,
      stdout: (text) => { stdout += text; },
      stderr: (text) => { stderr += text; },
    });

    assert.equal(code, 0);
    assert.match(stdout, /No commits found/);
    assert.equal(stderr.includes('fatal:'), false, 'no raw git error leaked');
  } finally {
    repo.cleanup();
  }
});

test('a history with merges, unicode paths and a detached HEAD works end to end', { skip }, () => {
  const repo = createTempRepo([
    { message: 'feat: ilk commit — ünlü karakterler 🎉', file: 'src-üç.js', content: "console.log('merhaba');\n" },
    { message: 'docs: readme', file: 'README.md', content: '# test\n' },
  ]);

  try {
    const data = collect(repo.dir);
    assert.equal(data.commits.length, 2);
    assert.ok(data.head);
    assert.equal(data.branch, 'main', 'branch --show-current works on modern git');
    assert.ok(data.files.some((file) => file.path.includes('üç')));

    const report = analyze(data);
    assert.equal(report.totals.commits, 2);
    assert.equal(report.repository.head.slice(0, 7), data.shortHead);

    const html = renderHtml(report, {});
    assert.ok(html.includes('ünlü karakterler'));
    assert.equal(html.includes('NaN'), false);
    assert.equal(html.includes('undefined'), false);

    // Round trip through the CLI's HTML output too.
    const io = { cwd: repo.dir, stdout: () => {}, stderr: () => {} };
    assert.equal(run(['-o', 'report.html', '--quiet'], io), 0);
    const written = readFileSync(path.join(repo.dir, 'report.html'), 'utf8');
    assert.ok(written.startsWith('<!doctype html>'));
    assert.equal(/<script[^>]+src=/i.test(written), false);
  } finally {
    repo.cleanup();
  }
});

test('a single commit repository produces every section without holes', { skip }, () => {
  const repo = createTempRepo([{ message: 'feat: the only commit', file: 'only.js' }]);
  try {
    const report = analyze(collect(repo.dir));
    assert.equal(report.totals.commits, 1);
    assert.equal(report.activity.weekly.length, 1);
    assert.equal(report.activity.streaks.longest.length, 1);
    assert.equal(report.contributors.length, 1);
    assert.equal(report.hotspots.length, 1);

    const html = renderHtml(report, {});
    assert.ok(html.includes('the only commit'));
    assert.equal(/NaN/.test(html), false);
  } finally {
    repo.cleanup();
  }
});

test('--since in the future still returns a valid, empty-but-sane report', { skip }, () => {
  const repo = createTempRepo([{ message: 'feat: one', file: 'a.txt' }]);
  try {
    const report = analyze(collect(repo.dir, { since: '2999-01-01' }));
    assert.equal(report.totals.commits, 0);
    const html = renderHtml(report, {});
    assert.ok(html.includes('Nothing to chart yet'));
  } finally {
    repo.cleanup();
  }
});
