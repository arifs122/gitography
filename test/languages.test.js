import assert from 'node:assert/strict';
import test from 'node:test';

import { extensionOf, isCode, languageOf, LANGUAGE_COUNT } from '../src/languages.js';

test('the extension table is substantial', () => {
  assert.ok(LANGUAGE_COUNT > 100, `expected a large table, got ${LANGUAGE_COUNT}`);
});

test('common extensions map to languages', () => {
  assert.equal(languageOf('src/a.js'), 'JavaScript');
  assert.equal(languageOf('src/a.ts'), 'TypeScript');
  assert.equal(languageOf('src/a.tsx'), 'TypeScript');
  assert.equal(languageOf('main.py'), 'Python');
  assert.equal(languageOf('cmd/server/main.go'), 'Go');
  assert.equal(languageOf('lib.rs'), 'Rust');
  assert.equal(languageOf('src/styles/app.scss'), 'SCSS');
  assert.equal(languageOf('deploy/k8s.yaml'), 'YAML');
});

test('declaration files and extensionless files are handled', () => {
  assert.equal(languageOf('types/index.d.ts'), 'TypeScript');
  assert.equal(languageOf('Dockerfile'), 'Dockerfile');
  assert.equal(languageOf('docker/Dockerfile.prod'), 'Dockerfile');
  assert.equal(languageOf('Makefile'), 'Makefile');
  assert.equal(languageOf('CMakeLists.txt'), 'CMake');
  assert.equal(languageOf('Gemfile'), 'Ruby');
});

test('unknown extensions fall back to Other', () => {
  assert.equal(languageOf('data/thing.xyzzy'), 'Other');
  assert.equal(languageOf('no-extension-here'), 'Other');
});

test('binary and generated assets are skipped entirely', () => {
  assert.equal(languageOf('assets/logo.png'), null);
  assert.equal(languageOf('fonts/inter.woff2'), null);
  assert.equal(languageOf('dist/bundle.min.js'), null);
  assert.equal(languageOf('dist/site.min.css'), null);
  assert.equal(languageOf('archive.tar.gz'), null);
});

test('windows separators are tolerated', () => {
  assert.equal(languageOf('src\\components\\Button.tsx'), 'TypeScript');
});

test('extensionOf returns the last extension', () => {
  assert.equal(extensionOf('a.test.js'), '.js');
  assert.equal(extensionOf('noext'), '');
  assert.equal(extensionOf('.gitignore'), '');
});

test('isCode separates source from metadata', () => {
  assert.equal(isCode('JavaScript'), true);
  assert.equal(isCode('Python'), true);
  assert.equal(isCode('Markdown'), false);
  assert.equal(isCode('JSON'), false);
  assert.equal(isCode('YAML'), false);
  assert.equal(isCode('Other'), false);
});
