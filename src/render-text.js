/**
 * Terminal renderer — the summary you see right after running the command.
 */

import { bar, bold, cyan, dim, gray, green, magenta, paint, sparkline, yellow } from './colors.js';
import { compact, humanDuration, num, prettyDate, truncate } from './util.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * @param {object} report output of `analyze()`
 * @param {{ outputPath?: string, color?: boolean, verbose?: boolean }} [options]
 * @returns {string}
 */
export function renderText(report, options = {}) {
  const { outputPath, verbose = true } = options;
  const lines = [];
  const repo = report.repository;
  const totals = report.totals;

  const title = repo.owner ? `${repo.owner}/${repo.name}` : repo.name;
  const width = 74;

  lines.push('');
  lines.push(`  ${bold('gitography')} ${dim('──')} ${bold(title)}`);
  lines.push(`  ${dim('─'.repeat(width))}`);

  if (totals.commits === 0) {
    lines.push('');
    lines.push(`  ${yellow('No commits found.')} ${report.warnings[0] ?? ''}`);
    lines.push('');
    return lines.join('\n');
  }

  lines.push(
    `  ${num(totals.commits)} commits  ${dim('·')}  ${num(totals.contributors)} contributors  ${dim('·')}  `
    + `${num(totals.filesTracked)} files  ${dim('·')}  ${report.range.age}`,
  );
  lines.push(
    `  ${green(`+${num(totals.insertions)}`)} ${dim('/')} ${paint(`-${num(totals.deletions)}`, 'red')} lines  `
    + `${dim('·')}  ${num(totals.activeDays)} active days  ${dim('·')}  ${report.velocity.perWeek.toFixed(1)} commits/week`,
  );
  lines.push('');

  if (verbose) {
    // Activity sparkline over weeks.
    const weekly = report.activity.weekly.map((w) => w.commits);
    if (weekly.length > 1) {
      const tail = weekly.slice(-60);
      lines.push(`  ${dim('activity')}  ${cyan(sparkline(tail))}  ${dim(`last ${tail.length} weeks`)}`);
    }
    if (report.activity.busiestDay) {
      lines.push(
        `  ${dim('busiest')}   ${prettyDate(report.activity.busiestDay.date)} `
        + `${dim('·')} ${report.activity.busiestDay.count} commits`,
      );
    }
    if (report.activity.streaks.longest.length > 1) {
      lines.push(
        `  ${dim('streak')}    ${report.activity.streaks.longest.length} days `
        + `${dim(`(${prettyDate(report.activity.streaks.longest.start)} → ${prettyDate(report.activity.streaks.longest.end)})`)}`,
      );
    }
    lines.push('');
  }

  // ------------------------------------------------------------- contributors
  if (report.contributors.length) {
    lines.push(`  ${bold('Contributors')}`);
    const max = report.contributors[0].commits;
    for (const [index, person] of report.contributors.slice(0, 10).entries()) {
      const rank = String(index + 1).padStart(2, ' ');
      const name = truncate(person.name, 22).padEnd(22, ' ');
      const commits = String(num(person.commits)).padStart(7, ' ');
      lines.push(
        `  ${dim(rank)}. ${name} ${cyan(bar(person.commits, max, 18))} ${commits}  ${dim(`${person.share.toFixed(1)}%`)}`,
      );
    }
    if (report.contributorCount > report.contributors.length) {
      lines.push(`  ${dim(`     … and ${num(report.contributorCount - report.contributors.length)} more`)}`);
    }
    lines.push('');
  }

  // ---------------------------------------------------------------- languages
  if (report.languages.length) {
    lines.push(`  ${bold('Languages')} ${dim(`(${report.codeShare.toFixed(0)}% code)`)}`);
    const max = report.languages[0].bytes;
    for (const language of report.languages.slice(0, 6)) {
      const name = truncate(language.name, 18).padEnd(18, ' ');
      lines.push(
        `  ${name} ${magenta(bar(language.bytes, max, 18))} ${dim(`${language.share.toFixed(1)}%`)}`,
      );
    }
    lines.push('');
  }

  // ----------------------------------------------------------------- hotspots
  if (report.hotspots.length && verbose) {
    lines.push(`  ${bold('Hotspots')} ${dim('(most churned files)')}`);
    for (const hotspot of report.hotspots.slice(0, 6)) {
      lines.push(
        `  ${truncate(hotspot.path, 44).padEnd(44, ' ')} ${dim(`${String(hotspot.commits).padStart(4, ' ')} commits`)} `
        + `${green(`+${compact(hotspot.insertions)}`)} ${paint(`-${compact(hotspot.deletions)}`, 'red')}`,
      );
    }
    lines.push('');
  }

  // ------------------------------------------------------------------- awards
  if (report.awards.length) {
    lines.push(`  ${bold('Awards')}`);
    for (const award of report.awards.slice(0, 7)) {
      lines.push(`  ${award.emoji} ${bold(truncate(award.headline, 30).padEnd(30, ' '))} ${dim(award.title)}`);
    }
    lines.push('');
  }

  // ---------------------------------------------------------------- messages
  if (verbose) {
    const messages = report.messages;
    lines.push(`  ${bold('Commits')}`);
    lines.push(
      `  ${dim('average subject')} ${messages.avgLength} chars  ${dim('·')}  `
      + `${dim('conventional')} ${messages.conventional.share.toFixed(0)}%  ${dim('·')}  `
      + `${dim('issue refs')} ${messages.issueRefShare.toFixed(0)}%`,
    );
    if (messages.topWords.length) {
      const words = messages.topWords.slice(0, 8).map((w) => w.word).join(', ');
      lines.push(`  ${dim('top words')} ${gray(words)}`);
    }
    lines.push('');
  }

  // --------------------------------------------------------------- bus factor
  if (report.busFactor.n) {
    lines.push(`  ${dim('bus factor')}  ${bold(String(report.busFactor.n))} ${dim(
      `${report.busFactor.n === 1 ? 'person covers' : 'people cover'} ${report.busFactor.share.toFixed(0)}% of the history`,
    )}`);
  }

  for (const warning of report.warnings) {
    lines.push(`  ${yellow('!')} ${warning}`);
  }

  if (outputPath) {
    lines.push('');
    lines.push(`  ${green('✓')} ${bold('Report written')} ${dim('→')} ${outputPath}`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Format a short one-line summary, used by watch mode and tests.
 * @param {object} report
 */
export function summaryLine(report) {
  const totals = report.totals;
  return `${report.repository.name}: ${num(totals.commits)} commits by ${num(totals.contributors)} people `
    + `over ${humanDuration(report.range.days)}, ${num(totals.insertions)}+/${num(totals.deletions)}- lines.`;
}

export { WEEKDAYS };
