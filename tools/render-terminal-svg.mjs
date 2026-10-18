#!/usr/bin/env node
/**
 * Docs helper: turn captured terminal output into a self-contained SVG.
 *
 * README screenshots go stale and are heavy. A terminal SVG is a few kilobytes,
 * stays crisp at any zoom, and is diffable in review — so the demo strip in the
 * README is generated from real output by this script:
 *
 *   node bin/gitography.js . --format text --no-color > docs/demo/cli.txt
 *   node tools/render-terminal-svg.mjs docs/demo/cli.txt docs/demo/cli.svg
 *
 * Not part of the published package (`files` in package.json only ships bin/ and src/).
 */

import { readFileSync, writeFileSync } from 'node:fs';

const [, , inputPath, outputPath, fontSizeArg] = process.argv;

if (!inputPath || !outputPath) {
  console.error('usage: render-terminal-svg.mjs <input.txt> <output.svg> [fontSize]');
  process.exit(1);
}

const COLORS = {
  bg: '#0a0a12',
  chrome: '#13131f',
  border: '#242438',
  text: '#d7dbe8',
  faint: '#5b6079',
  accent: '#8b7cff',
  green: '#4ade80',
  red: '#fb7185',
  amber: '#fbbf24',
};

const FONT_SIZE = Number(fontSizeArg) || 12.5;
const LINE_HEIGHT = Math.round(FONT_SIZE * 1.5);
const PADDING_X = 22;
const CHROME_HEIGHT = 38;
const PADDING_BOTTOM = 20;

const raw = readFileSync(inputPath, 'utf8');
// eslint-disable-next-line no-control-regex
const clean = raw
  .replace(/^\uFEFF/, '') // tolerate a UTF-8 BOM from PowerShell redirection
  .replace(/\u001b\[[0-9;]*m/g, '')
  .replace(/\r\n/g, '\n')
  .replace(/\s+$/, '');
const lines = clean.split('\n');

const escapeXml = (value) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** Monospace advance width is roughly 0.6em for the default stack. */
const CHAR_WIDTH = FONT_SIZE * 0.6;
const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
const width = Math.ceil(PADDING_X * 2 + longest * CHAR_WIDTH);
const height = Math.ceil(CHROME_HEIGHT + PADDING_BOTTOM + lines.length * LINE_HEIGHT);

/** @param {string} line @param {number} index */
function colorOf(line, index) {
  if (index < 2 && line.includes('gitography')) return COLORS.accent;
  if (/^[\s\u2500]+$/.test(line) || line.trim() === '') return COLORS.faint;
  if (/\+\d[\d,]*\s*\/\s*-\d/.test(line)) return COLORS.text;
  if (/\+\d[\d,]*/.test(line) && line.includes('/')) return COLORS.text;
  if (/^\s*\d+\./.test(line)) return COLORS.text;
  if (line.includes('✓')) return COLORS.green;
  if (line.trim().startsWith('!')) return COLORS.amber;
  return COLORS.text;
}

/** Emphasise +N / -N runs by splitting the line into tspans. */
function spans(line, baseColor) {
  const parts = [];
  const regex = /(\+\d[\d,.]*)|(-[\d][\d,.]*)/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: line.slice(lastIndex, match.index), color: baseColor });
    }
    parts.push({ text: match[0], color: match[0].startsWith('+') ? COLORS.green : COLORS.red });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < line.length) parts.push({ text: line.slice(lastIndex), color: baseColor });
  return parts
    .map((part, partIndex) => `<tspan${partIndex === 0 ? '' : ` fill="${part.color}"`}>${escapeXml(part.text)}</tspan>`)
    .join('');
}

const body = lines
  .map((line, index) => {
    const y = CHROME_HEIGHT + LINE_HEIGHT * (index + 1) - 6;
    const color = colorOf(line, index);
    const content = spans(line, color);
    const weight = index < 2 && line.includes('gitography') ? ' font-weight="700"' : '';
    return `<text x="${PADDING_X}" y="${y}" fill="${color}"${weight}>${content || ' '}</text>`;
  })
  .join('\n  ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="gitography terminal output">
  <defs>
    <linearGradient id="chrome" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#151527"/>
      <stop offset="100%" stop-color="#101020"/>
    </linearGradient>
    <clipPath id="window">
      <rect x="0" y="0" width="${width}" height="${height}" rx="14"/>
    </clipPath>
  </defs>
  <g clip-path="url(#window)">
    <rect width="${width}" height="${height}" fill="${COLORS.bg}"/>
    <rect width="${width}" height="${CHROME_HEIGHT}" fill="url(#chrome)"/>
    <circle cx="20" cy="${CHROME_HEIGHT / 2}" r="6" fill="#ff5f57"/>
    <circle cx="40" cy="${CHROME_HEIGHT / 2}" r="6" fill="#febc2e"/>
    <circle cx="60" cy="${CHROME_HEIGHT / 2}" r="6" fill="#28c840"/>
    <text x="${width / 2}" y="${CHROME_HEIGHT / 2 + 4}" fill="${COLORS.faint}" font-size="12" text-anchor="middle" font-family="ui-monospace, Consolas, monospace">gitography</text>
    <g font-family="ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace" font-size="${FONT_SIZE}" xml:space="preserve">
  ${body}
    </g>
  </g>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="14" fill="none" stroke="${COLORS.border}"/>
</svg>
`;

writeFileSync(outputPath, svg, 'utf8');
console.log(`wrote ${outputPath} (${width}x${height}, ${lines.length} lines)`);
