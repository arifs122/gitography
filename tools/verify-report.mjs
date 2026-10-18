#!/usr/bin/env node
/**
 * Docs/CI helper: assert that a generated HTML report is truly self-contained.
 *
 *   node tools/verify-report.mjs docs/demo/express.html
 *
 * Fails with exit code 1 when the report references anything it would have to
 * fetch at runtime (scripts, stylesheets, fonts, images, imports).
 */

import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: verify-report.mjs <report.html> [more.html]');
  process.exit(1);
}

const RULES = [
  { name: 'external script', pattern: /<script[^>]+src=/i },
  { name: 'external stylesheet', pattern: /<link[^>]+rel=["']?stylesheet/i },
  { name: 'css @import', pattern: /@import/i },
  { name: 'remote url()', pattern: /url\(\s*["']?https?:/i },
  { name: 'remote image', pattern: /<img[^>]+src=["']https?:/i },
  { name: 'remote iframe', pattern: /<iframe/i },
  { name: 'meta refresh', pattern: /http-equiv=["']?refresh/i },
];
// Note: `<a href="https://...">` links are intentionally allowed. They are
// user-initiated navigations, not something the report fetches on load.

let failed = false;

for (const file of files) {
  const html = readFileSync(file, 'utf8');
  const problems = RULES.filter((rule) => rule.pattern.test(html));

  // A data: URI on the favicon is fine, but it must not smuggle a request.
  const dataUris = (html.match(/data:image\/svg\+xml/g) ?? []).length;
  const size = Buffer.byteLength(html);

  if (problems.length) {
    failed = true;
    console.error(`✗ ${file}`);
    for (const problem of problems) console.error(`    found ${problem.name}`);
  } else {
    console.log(`✓ ${file} is self-contained (${(size / 1024).toFixed(1)} KB, ${dataUris} inline data URI(s))`);
  }
}

process.exit(failed ? 1 : 0);
