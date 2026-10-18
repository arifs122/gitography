/**
 * gitography — public programmatic API.
 *
 * ```js
 * import { collect, analyze, renderHtml } from 'gitography';
 *
 * const report = analyze(collect(process.cwd()));
 * const html = renderHtml(report, { theme: 'dark' });
 * ```
 */

export { collect, collectIdentity, findRepositoryRoot, isRepository, parseLog, parseTree, remoteToWebUrl, GitError } from './collect.js';
export { analyze } from './analyze.js';
export { computeAwards } from './awards.js';
export { renderHtml } from './render-html.js';
export { renderText, summaryLine } from './render-text.js';
export { renderMarkdown } from './render-markdown.js';
export { run, parseArgs, openInBrowser, readVersion, HELP, FORMATS } from './cli.js';
export { languageOf, isCode } from './languages.js';
export * from './util.js';

export const version = '0.1.0';
