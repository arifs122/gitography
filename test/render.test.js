import assert from 'node:assert/strict';
import test from 'node:test';

import { analyze } from '../src/analyze.js';
import { setColorEnabled } from '../src/colors.js';
import { renderHtml } from '../src/render-html.js';
import { renderMarkdown } from '../src/render-markdown.js';
import { renderText, summaryLine } from '../src/render-text.js';
import { commit, dataset, sampleDataset } from './helpers.js';

const report = analyze(sampleDataset());
const options = { command: 'gitography .', generatedAt: '2024-06-01T12:00:00.000Z' };

test('renderHtml produces a complete standalone document', () => {
  const html = renderHtml(report, options);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.endsWith('</html>\n'));
  assert.ok(html.includes('<meta charset="utf-8">'));
  assert.ok(html.includes('name="generator" content="gitography"'));
  assert.ok(html.includes('data-theme="dark"'));
  assert.ok(html.includes('acme/demo'));
  assert.ok(html.includes('Ada Lovelace'));
  assert.ok(html.includes('Grace Hopper'));
});

test('renderHtml makes no external requests', () => {
  const html = renderHtml(report, options);
  assert.equal(/<script[^>]+src=/i.test(html), false, 'no external scripts');
  assert.equal(/<link[^>]+rel=["']?stylesheet/i.test(html), false, 'no external stylesheets');
  assert.equal(/@import/i.test(html), false, 'no css imports');
  assert.equal(/src=["']https?:/i.test(html), false, 'no remote images');
  assert.equal(/href=["']https?:/i.test(html), false, 'no remote links in the default report');
  assert.equal(/url\(\s*["']?https?:/i.test(html), false, 'no remote fonts');
  // The only URL-ish strings may be the SVG namespace and the data-uri favicon.
  assert.ok(html.includes('data:image/svg+xml'));
});

test('renderHtml escapes hostile repository content', () => {
  const hostile = analyze(dataset([
    commit({
      sha: 'a'.repeat(40),
      author: '<img src=x onerror=alert(1)>',
      email: 'evil@example.com',
      subject: '<script>alert("pwned")</script>',
      files: ['src/<script>.js'],
      date: '2023-01-15T10:00:00Z',
    }),
  ]), { asOf: '2024-01-01T00:00:00Z' });

  const html = renderHtml(hostile, { title: '</title><script>alert(1)</script>' });

  assert.equal(html.includes('<script>alert("pwned")'), false);
  assert.equal(html.includes('<img src=x onerror'), false);
  assert.equal(html.includes('</title><script>'), false);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;img src=x onerror'));
});

test('renderHtml honours the light theme and custom titles', () => {
  const html = renderHtml(report, { ...options, theme: 'light', title: 'My Project', subtitle: 'A subtitle' });
  assert.ok(html.includes('data-theme="light"'));
  assert.ok(html.includes('<h1>My Project</h1>'));
  assert.ok(html.includes('A subtitle'));
  assert.equal(html.includes('acme/demo</h1>'), false);
});

test('renderHtml renders an empty repository without crashing', () => {
  const empty = analyze(dataset([]));
  const html = renderHtml(empty, options);
  assert.ok(html.includes('Nothing to chart yet'));
  assert.ok(html.includes('no commits yet'));
  assert.equal(/NaN|undefined/.test(html), false, 'no leaked NaN/undefined values');
});

test('renderHtml never leaks NaN or undefined for odd data', () => {
  const odd = analyze(dataset([
    commit({ sha: 'a'.repeat(40), subject: '', files: [], date: '2023-01-15T10:00:00Z', insertions: 0, deletions: 0, churn: 0 }),
    commit({ sha: 'b'.repeat(40), subject: 'b', files: [{ path: 'x.bin', added: 0, deleted: 0, binary: true }], date: '2023-01-15T11:00:00Z' }),
  ], { files: [] }));

  const html = renderHtml(odd, options);
  assert.equal(html.includes('NaN'), false);
  assert.equal(html.includes('undefined'), false);
  assert.equal(html.includes('Infinity'), false);
});

test('renderMarkdown emits GitHub friendly tables', () => {
  const markdown = renderMarkdown(report, {});
  assert.ok(markdown.startsWith('# acme/demo — repository report'));
  assert.ok(markdown.includes('| Commits | 3 |'));
  assert.ok(markdown.includes('| Contributors | 2 |'));
  assert.ok(markdown.includes('### Top contributors'));
  assert.ok(markdown.includes('Ada Lovelace'));
  assert.ok(markdown.includes('### Awards'));
  assert.ok(markdown.includes('| Language | Share | Size | Files |'));
});

test('renderMarkdown escapes pipes so tables stay intact', () => {
  const weird = analyze(dataset([
    commit({ sha: 'a'.repeat(40), author: 'A|B', subject: 'feat: pipes | everywhere', date: '2023-01-15T10:00:00Z' }),
  ]), { asOf: '2024-01-01T00:00:00Z' });

  const markdown = renderMarkdown(weird, {});
  assert.ok(markdown.includes('A\\|B'));
});

test('renderText prints a readable summary', () => {
  setColorEnabled(false);
  try {
    const text = renderText(report, { outputPath: 'out.html' });
    assert.ok(text.includes('gitography'));
    assert.ok(text.includes('acme/demo'));
    assert.ok(text.includes('3 commits'));
    assert.ok(text.includes('Contributors'));
    assert.ok(text.includes('Awards'));
    assert.ok(text.includes('Report written'));
    assert.equal(text.includes('\u001b['), false, 'colour is disabled in tests');

    const empty = renderText(analyze(dataset([])), {});
    assert.ok(empty.includes('No commits found'));

    assert.match(summaryLine(report), /demo: 3 commits by 2 people/);
  } finally {
    setColorEnabled(true);
  }
});

test('the report survives a single commit repository', () => {
  const single = analyze(dataset([
    commit({ sha: 'a'.repeat(40), date: '2023-01-15T10:00:00Z', subject: 'initial commit', files: ['README.md'] }),
  ]), { asOf: '2024-01-01T00:00:00Z' });

  const html = renderHtml(single, options);
  assert.ok(html.includes('initial commit'));
  assert.equal(html.includes('NaN'), false);
  assert.equal(/undefined/.test(html), false);
});
