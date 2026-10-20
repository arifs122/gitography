/**
 * Small, dependency-free helpers shared across gitography.
 * Everything here is pure so it can be unit tested in isolation.
 */

/** Record separator used when framing `git log` output. */
export const RECORD_SEP = '\u001e';
/** Field separator used inside a single commit header. */
export const FIELD_SEP = '\u001f';

const numberFormat = new Intl.NumberFormat('en-US');

/**
 * Format an integer with thin thousands separators: 1234567 -> "1,234,567".
 * @param {number} value
 * @returns {string}
 */
export function num(value) {
  if (!Number.isFinite(value)) return '0';
  return numberFormat.format(Math.round(value));
}

/**
 * Compact formatting for chart labels: 1234 -> "1.2k", 1250000 -> "1.3M".
 * @param {number} value
 * @returns {string}
 */
export function compact(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return trimZero(n / 1_000_000_000) + 'B';
  if (abs >= 1_000_000) return trimZero(n / 1_000_000) + 'M';
  if (abs >= 1_000) return trimZero(n / 1_000) + 'k';
  return String(Math.round(n));
}

function trimZero(n) {
  return (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

/**
 * Human readable byte size in binary units.
 * @param {number} bytes
 * @returns {string}
 */
export function bytes(size) {
  const n = Number(size) || 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${i === 0 ? Math.round(v) : trimZero(v)} ${units[i]}`;
}

/**
 * Percentage with one decimal place, clamped to [0, 100].
 * @param {number} part
 * @param {number} whole
 * @returns {number}
 */
export function percent(part, whole) {
  if (!whole) return 0;
  return Math.max(0, Math.min(100, (part / whole) * 100));
}

/**
 * Render a value as a percentage string: 12.34 -> "12.3%".
 * @param {number} part
 * @param {number} whole
 */
export function pct(part, whole) {
  return `${percent(part, whole).toFixed(1)}%`;
}

/**
 * Escape a string for safe interpolation into HTML text or attributes.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape a string for embedding inside a `<script>` block as JSON.
 * @param {unknown} value
 * @returns {string}
 */
export function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Sum a list of numbers (or of objects via a selector).
 * @param {Array<any>} list
 * @param {(item: any) => number} [selector]
 * @returns {number}
 */
export function sum(list, selector = (x) => x) {
  let total = 0;
  for (const item of list) total += Number(selector(item)) || 0;
  return total;
}

/**
 * Median of a numeric array. Returns 0 for an empty list.
 * @param {number[]} values
 */
export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Clamp a number into an inclusive range.
 */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Day key in the author's own timezone, derived from an ISO-8601 author date.
 * We deliberately avoid `Date` parsing here because git already gives us the
 * wall-clock time plus the author's UTC offset, which is what a human means by
 * "I committed at 2am".
 * @param {string} iso e.g. "2023-01-15T22:30:00+03:00"
 */
export function isoDay(iso) {
  return String(iso).slice(0, 10);
}

/**
 * Hour of day (0-23) in the author's own timezone.
 * @param {string} iso
 */
export function isoHour(iso) {
  return Number(String(iso).slice(11, 13)) || 0;
}

/**
 * Weekday index (0 = Sunday) for the local calendar date inside an ISO string.
 * Uses UTC maths on the already-local date parts so host timezone is ignored.
 * @param {string} iso
 */
export function isoWeekday(iso) {
  const [y, m, d] = isoDay(iso).split('-').map(Number);
  if (!y || !m || !d) return 0;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * The Monday that starts the ISO week containing the given day key.
 * @param {string} dayKey "YYYY-MM-DD"
 * @returns {string} "YYYY-MM-DD"
 */
export function weekStart(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const shift = (date.getUTCDay() + 6) % 7; // Monday = 0
  date.setUTCDate(date.getUTCDate() - shift);
  return date.toISOString().slice(0, 10);
}

/**
 * Add `days` to a day key and return a new day key.
 * @param {string} dayKey "YYYY-MM-DD"
 * @param {number} days
 */
export function addDays(dayKey, days) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Whole days between two day keys (b - a).
 * @param {string} a
 * @param {string} b
 */
export function daysBetween(a, b) {
  const toUtc = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/**
 * Human friendly duration for an age in days: "3 years, 2 months".
 * @param {number} days
 */
export function humanDuration(days) {
  const d = Math.max(0, Math.round(days));
  if (d < 1) return 'less than a day';
  if (d < 31) return `${d} day${d === 1 ? '' : 's'}`;
  const months = Math.floor(d / 30.44);
  const years = Math.floor(d / 365.25);
  if (years >= 1) {
    const remMonths = Math.round((d - years * 365.25) / 30.44);
    return remMonths > 0
      ? `${years} year${years === 1 ? '' : 's'}, ${remMonths} month${remMonths === 1 ? '' : 's'}`
      : `${years} year${years === 1 ? '' : 's'}`;
  }
  return `${months} month${months === 1 ? '' : 's'}`;
}

/**
 * A relative "time ago" style label: "3 days ago".
 * @param {string} iso
 * @param {Date} [now]
 */
export function timeAgo(iso, now = new Date()) {
  const then = new Date(iso);
  const seconds = Math.max(0, (now.getTime() - then.getTime()) / 1000);
  const table = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.35, 'week'],
    [12, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ];
  let value = seconds;
  for (const [step, label] of table) {
    if (value < step) {
      const rounded = Math.max(1, Math.round(value));
      return `${rounded} ${label}${rounded === 1 ? '' : 's'} ago`;
    }
    value /= step;
  }
  return 'a while ago';
}

/**
 * Format a "YYYY-MM-DD" key as "15 Jan 2023".
 * @param {string} dayKey
 */
export function prettyDate(dayKey) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = String(dayKey).split('-').map(Number);
  if (!y || !m || !d) return String(dayKey);
  return `${d} ${months[m - 1]} ${y}`;
}

/**
 * Format a "YYYY-MM" key as "Jan 2023".
 * @param {string} monthKey
 */
export function prettyMonth(monthKey) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m] = String(monthKey).split('-').map(Number);
  if (!y || !m) return String(monthKey);
  return `${months[m - 1]} ${y}`;
}

/**
 * Build a "nice" axis scale: round step size and rounded maximum.
 * @param {number} max
 * @param {number} [ticks]
 */
export function niceScale(max, ticks = 4) {
  const value = Math.max(1, Number(max) || 1);
  const rawStep = value / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  return { step, max: Math.ceil(value / step) * step };
}

/**
 * Percentile of a numeric array (p in 0..1).
 * @param {number[]} values
 * @param {number} p
 */
export function quantile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = clamp(p, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Group into a Map using a key function.
 * @template T
 * @param {T[]} list
 * @param {(item: T) => string} keyFn
 * @returns {Map<string, T[]>}
 */
export function groupBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const key = keyFn(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}

/**
 * A deterministic pastel-ish colour for a given string, used for avatars and
 * language slices. Keeps output stable between runs.
 * @param {string} text
 * @returns {string} hsl() colour
 */
export function colorFor(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 68% 58%)`;
}

/**
 * Initials for an avatar bubble: "Ada Lovelace" -> "AL".
 * @param {string} name
 */
export function initials(name) {
  const parts = String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Truncate a string to `max` characters, adding an ellipsis when cut.
 * @param {string} text
 * @param {number} max
 */
export function truncate(text, max) {
  const value = String(text ?? '');
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Normalise a path for display: strip leading "./" and collapse separators.
 * @param {string} filePath
 */
export function normalizePath(filePath) {
  return String(filePath).replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Split a path into directory + basename.
 * @param {string} filePath
 */
export function splitPath(filePath) {
  const clean = normalizePath(filePath);
  const idx = clean.lastIndexOf('/');
  if (idx === -1) return { dir: '', base: clean };
  return { dir: clean.slice(0, idx), base: clean.slice(idx + 1) };
}
