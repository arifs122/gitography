import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addDays,
  bytes,
  clamp,
  colorFor,
  compact,
  daysBetween,
  escapeHtml,
  humanDuration,
  initials,
  isoDay,
  isoHour,
  isoWeekday,
  jsonForScript,
  median,
  niceScale,
  normalizePath,
  num,
  pct,
  percent,
  prettyDate,
  prettyMonth,
  quantile,
  splitPath,
  sum,
  timeAgo,
  truncate,
  weekStart,
} from '../src/util.js';

test('num formats integers with thin separators', () => {
  assert.equal(num(0), '0');
  assert.equal(num(1234), '1,234');
  assert.equal(num(1234567), '1,234,567');
  assert.equal(num(Number.NaN), '0');
});

test('compact shortens large numbers', () => {
  assert.equal(compact(999), '999');
  assert.equal(compact(1200), '1.2k');
  assert.equal(compact(1500), '1.5k');
  assert.equal(compact(1250000), '1.3M');
});

test('bytes uses binary units', () => {
  assert.equal(bytes(512), '512 B');
  assert.equal(bytes(1024), '1 KB');
  assert.equal(bytes(1536), '1.5 KB');
  assert.equal(bytes(1048576), '1 MB');
});

test('percent and pct clamp to 0..100', () => {
  assert.equal(percent(1, 4), 25);
  assert.equal(percent(5, 4), 100);
  assert.equal(percent(1, 0), 0);
  assert.equal(pct(1, 3), '33.3%');
});

test('sum and median and quantile behave', () => {
  assert.equal(sum([1, 2, 3]), 6);
  assert.equal(sum([{ n: 2 }, { n: 3 }], (item) => item.n), 5);
  assert.equal(median([]), 0);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([], 0.5), 0);
});

test('clamp bounds a number', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
});

test('ISO helpers read the author local wall clock', () => {
  const iso = '2023-01-15T22:30:00+03:00';
  assert.equal(isoDay(iso), '2023-01-15');
  assert.equal(isoHour(iso), 22);
  assert.equal(isoWeekday(iso), 0, '15 Jan 2023 was a Sunday');
  assert.equal(isoHour('nonsense'), 0);
});

test('weekStart returns the Monday of the week', () => {
  assert.equal(weekStart('2023-01-15'), '2023-01-09');
  assert.equal(weekStart('2023-01-09'), '2023-01-09');
  assert.equal(weekStart('2023-01-22'), '2023-01-16');
});

test('addDays and daysBetween are inverse', () => {
  assert.equal(addDays('2023-01-31', 1), '2023-02-01');
  assert.equal(addDays('2023-03-01', -1), '2023-02-28');
  assert.equal(daysBetween('2023-01-01', '2023-01-31'), 30);
  assert.equal(daysBetween('2023-02-28', '2023-01-01'), -58);
});

test('humanDuration is readable', () => {
  assert.equal(humanDuration(0), 'less than a day');
  assert.equal(humanDuration(1), '1 day');
  assert.equal(humanDuration(7), '7 days');
  assert.match(humanDuration(400), /^1 year, 1 month$/);
  assert.match(humanDuration(800), /^2 years/);
});

test('prettyDate and prettyMonth format labels', () => {
  assert.equal(prettyDate('2023-01-05'), '5 Jan 2023');
  assert.equal(prettyMonth('2023-11'), 'Nov 2023');
  assert.equal(prettyDate('bogus'), 'bogus');
});

test('niceScale produces round steps', () => {
  assert.deepEqual(niceScale(408, 4), { step: 200, max: 600 });
  assert.deepEqual(niceScale(10, 5), { step: 2, max: 10 });
  assert.equal(niceScale(0).max >= 1, true);
});

test('escapeHtml neutralises markup', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml("it's"), 'it&#39;s');
});

test('jsonForScript escapes script-breaking characters', () => {
  const out = jsonForScript({ a: '</script>', b: '\u2028' });
  assert.equal(out.includes('</script>'), false);
  assert.equal(out.includes('\\u003c'), true);
});

test('truncate adds an ellipsis only when needed', () => {
  assert.equal(truncate('hello', 10), 'hello');
  assert.equal(truncate('hello world', 8), 'hello w…');
  assert.equal(truncate('hello world', 8).length, 8);
});

test('colorFor is deterministic and initials are sensible', () => {
  assert.equal(colorFor('ada@example.com'), colorFor('ada@example.com'));
  assert.match(colorFor('x'), /^hsl\(\d+ 68% 58%\)$/);
  assert.equal(initials('Ada Lovelace'), 'AL');
  assert.equal(initials('madonna'), 'MA');
  assert.equal(initials(''), '?');
  assert.equal(initials('Alan M. Turing'), 'AT');
});

test('path helpers normalise separators', () => {
  assert.equal(normalizePath('.\\src\\a.js'), 'src/a.js');
  assert.deepEqual(splitPath('src/lib/a.js'), { dir: 'src/lib', base: 'a.js' });
  assert.deepEqual(splitPath('a.js'), { dir: '', base: 'a.js' });
});

test('timeAgo renders a relative label', () => {
  const now = new Date('2024-01-10T00:00:00Z');
  assert.equal(timeAgo('2024-01-09T23:00:00Z', now), '1 hour ago');
  assert.equal(timeAgo('2024-01-07T00:00:00Z', now), '3 days ago');
  assert.match(timeAgo('2022-01-01T00:00:00Z', now), /year/);
});
