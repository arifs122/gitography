/**
 * Tiny ANSI helper. No chalk, no kleur — just the escape codes we need, with a
 * global on/off switch driven by `--no-color`, `NO_COLOR` and TTY detection.
 */

const CODES = {
  reset: 0,
  bold: 1,
  dim: 2,
  italic: 3,
  underline: 4,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  gray: 90,
  brightRed: 91,
  brightGreen: 92,
  brightYellow: 93,
  brightBlue: 94,
  brightMagenta: 95,
  brightCyan: 96,
};

let enabled = detectSupport();

function detectSupport() {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout && process.stdout.isTTY);
}

/**
 * Enable or disable coloured output.
 * @param {boolean} value
 */
export function setColorEnabled(value) {
  enabled = Boolean(value);
}

/** @returns {boolean} */
export function isColorEnabled() {
  return enabled;
}

/**
 * Wrap text in one or more ANSI codes (no-ops when colour is disabled).
 * @param {string} text
 * @param {...(keyof CODES)} names
 * @returns {string}
 */
export function paint(text, ...names) {
  if (!enabled) return String(text);
  const codes = names.map((name) => CODES[name]).filter(Boolean);
  if (!codes.length) return String(text);
  return `\u001b[${codes.join(';')}m${text}\u001b[${CODES.reset}m`;
}

export const bold = (text) => paint(text, 'bold');
export const dim = (text) => paint(text, 'dim');
export const red = (text) => paint(text, 'red');
export const green = (text) => paint(text, 'green');
export const yellow = (text) => paint(text, 'yellow');
export const blue = (text) => paint(text, 'blue');
export const magenta = (text) => paint(text, 'magenta');
export const cyan = (text) => paint(text, 'cyan');
export const gray = (text) => paint(text, 'gray');

/**
 * Strip ANSI escapes — used by tests and by the markdown renderer.
 * @param {string} text
 */
export function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return String(text).replace(/\u001b\[[0-9;]*m/g, '');
}

/**
 * A horizontal bar using block characters.
 * @param {number} value
 * @param {number} max
 * @param {number} [width]
 * @returns {string}
 */
export function bar(value, max, width = 24) {
  if (!max || max <= 0) return '';
  const filled = Math.round((Math.max(0, value) / max) * width);
  return '█'.repeat(Math.max(value > 0 ? 1 : 0, filled)) + '░'.repeat(Math.max(0, width - filled));
}

/**
 * Sparkline from a numeric series using Unicode block elements.
 * @param {number[]} values
 * @returns {string}
 */
export function sparkline(values) {
  const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const max = Math.max(...values, 0);
  if (!values.length || max <= 0) return '';
  return values.map((v) => blocks[Math.min(blocks.length - 1, Math.round((v / max) * (blocks.length - 1)))]).join('');
}
