/**
 * The "awards wall" — the shareable, human part of the report.
 *
 * Awards are intentionally opinionated and a little playful: they are what
 * turns a pile of git statistics into something a team actually wants to post.
 * Every award degrades gracefully, and none of them are emitted when the data
 * cannot support a meaningful winner.
 */

import { percent, prettyDate, truncate } from './util.js';

/**
 * @typedef {object} Award
 * @property {string} id
 * @property {string} emoji
 * @property {string} title
 * @property {string} headline Winner or repo name
 * @property {string} detail One supporting sentence
 * @property {string} tone Colour token: violet | cyan | pink | amber | green
 */

/** Minimum commits before a per-person award is considered meaningful. */
const MIN_COMMITS = 5;

/**
 * @param {object} report output of `analyze()`
 * @param {Array<any>} [allContributors] full contributor list (not truncated)
 * @returns {Award[]}
 */
export function computeAwards(report, allContributors) {
  const contributors = (allContributors ?? report.contributors ?? []).filter(
    (c) => c.commits >= MIN_COMMITS,
  );
  /** @type {Award[]} */
  const awards = [];

  if (report.totals.commits === 0) return awards;

  const push = (award) => {
    if (award && awards.length < 9) awards.push(award);
  };

  // ------------------------------------------------------- most prolific dev
  const mvp = contributors[0] ?? (report.contributors ?? [])[0];
  if (mvp) {
    push({
      id: 'mvp',
      emoji: '👑',
      title: 'Most Valuable Committer',
      headline: mvp.name,
      detail: `${mvp.commits.toLocaleString('en-US')} commits — ${mvp.share.toFixed(1)}% of the entire history.`,
      tone: 'amber',
    });
  }

  // ------------------------------------------------------------- night owl
  const nightOwl = best(contributors, (c) => nightShare(c), { min: 8 });
  if (nightOwl && nightShare(nightOwl) >= 15) {
    push({
      id: 'night-owl',
      emoji: '🦉',
      title: 'Night Owl',
      headline: nightOwl.name,
      detail: `${nightShare(nightOwl).toFixed(0)}% of their commits land between midnight and 5am. Sleep is a myth.`,
      tone: 'violet',
    });
  }

  // ------------------------------------------------------------ early bird
  const earlyBird = best(contributors, (c) => morningShare(c), { min: 8 });
  if (earlyBird && morningShare(earlyBird) >= 25) {
    push({
      id: 'early-bird',
      emoji: '🌅',
      title: 'Early Bird',
      headline: earlyBird.name,
      detail: `${morningShare(earlyBird).toFixed(0)}% of their commits happen before 9am. The build is green before the coffee is.`,
      tone: 'amber',
    });
  }

  // -------------------------------------------------------- weekend warrior
  const weekendWarrior = best(contributors, (c) => c.weekendShare, { min: 10 });
  if (weekendWarrior && weekendWarrior.weekendShare >= 15) {
    push({
      id: 'weekend-warrior',
      emoji: '🏖️',
      title: 'Weekend Warrior',
      headline: weekendWarrior.name,
      detail: `${weekendWarrior.weekendShare.toFixed(0)}% of their commits were on a Saturday or Sunday.`,
      tone: 'cyan',
    });
  }

  // ------------------------------------------------------------- bug squasher
  const bugSquasher = best(contributors, (c) => c.fixes, { min: 10 });
  if (bugSquasher && bugSquasher.fixes >= 10) {
    push({
      id: 'bug-squasher',
      emoji: '🐛',
      title: 'Bug Squasher',
      headline: bugSquasher.name,
      detail: `${bugSquasher.fixes} bug-fix commits. Respect.`,
      tone: 'green',
    });
  }

  // -------------------------------------------------------------- heavy lifter
  const heavyLifter = best(contributors, (c) => c.insertions, { min: 5 });
  if (heavyLifter && heavyLifter.insertions > 0) {
    push({
      id: 'heavy-lifter',
      emoji: '🧱',
      title: 'Heavy Lifter',
      headline: heavyLifter.name,
      detail: `Wrote ${heavyLifter.insertions.toLocaleString('en-US')} lines of code across ${heavyLifter.filesTouched.toLocaleString('en-US')} files.`,
      tone: 'cyan',
    });
  }

  // ------------------------------------------------------- renaissance dev
  const polymath = best(contributors, (c) => c.filesTouched, { min: 5 });
  if (polymath && polymath.filesTouched >= 20) {
    push({
      id: 'polymath',
      emoji: '🎭',
      title: 'Renaissance Developer',
      headline: polymath.name,
      detail: `Touched ${polymath.filesTouched.toLocaleString('en-US')} distinct files. They know where everything lives.`,
      tone: 'pink',
    });
  }

  // ------------------------------------------------------------- wordsmith
  const verbose = best(contributors, (c) => c.avgSubjectLength, { min: 20 });
  const terse = least(contributors.filter((c) => c.avgSubjectLength > 0), (c) => c.avgSubjectLength, { min: 20 });
  if (verbose && verbose.avgSubjectLength >= 45) {
    push({
      id: 'wordsmith',
      emoji: '✍️',
      title: 'Wordsmith',
      headline: verbose.name,
      detail: `Average commit subject of ${verbose.avgSubjectLength} characters. Changelogs write themselves.`,
      tone: 'violet',
    });
  } else if (terse && terse.avgSubjectLength > 0 && terse.avgSubjectLength <= 28) {
    push({
      id: 'one-liner',
      emoji: '⚡',
      title: 'Master of the One-Liner',
      headline: terse.name,
      detail: `Average commit subject of just ${terse.avgSubjectLength} characters. Efficient.`,
      tone: 'violet',
    });
  }

  // ---------------------------------------------------------------- streaks
  if (report.activity.streaks?.longest?.length >= 3) {
    push({
      id: 'marathon',
      emoji: '🔥',
      title: 'Longest Streak',
      headline: `${report.activity.streaks.longest.length} days in a row`,
      detail: `From ${prettyDate(report.activity.streaks.longest.start)} to ${prettyDate(report.activity.streaks.longest.end)}.`,
      tone: 'pink',
    });
  }

  // ------------------------------------------------------------ biggest day
  if (report.activity.busiestDay && report.activity.busiestDay.count >= 5) {
    push({
      id: 'biggest-day',
      emoji: '🚀',
      title: 'Most Productive Day',
      headline: `${report.activity.busiestDay.count} commits`,
      detail: `On ${prettyDate(report.activity.busiestDay.date)}, ${report.repository.name} had its busiest day ever recorded.`,
      tone: 'green',
    });
  }

  // ---------------------------------------------------------- conventional
  if (report.messages.conventional.share >= 25 && report.messages.conventional.count >= 10) {
    const top = report.messages.conventional.types[0];
    push({
      id: 'conventional',
      emoji: '🎯',
      title: 'Conventional Commits',
      headline: `${report.messages.conventional.share.toFixed(0)}% adoption`,
      detail: top
        ? `"${top.type}" is the favourite prefix (${top.count} commits). Tooling loves this repo.`
        : 'A tidy commit history.',
      tone: 'cyan',
    });
  }

  // ------------------------------------------------------ the ancient one
  if (report.messages.firstCommit) {
    push({
      id: 'ancient',
      emoji: '🕰️',
      title: 'Where It All Began',
      headline: report.messages.firstCommit.author,
      detail: `Wrote the very first commit on ${prettyDate(report.messages.firstCommit.date)}: ${truncate(report.messages.firstCommit.subject, 60)}`,
      tone: 'amber',
    });
  }

  // ------------------------------------------------------------- bus factor
  if (report.busFactor.n > 0 && report.busFactor.risk !== 'low') {
    push({
      id: 'bus-factor',
      emoji: '🚌',
      title: 'Bus Factor',
      headline: `${report.busFactor.n} ${report.busFactor.n === 1 ? 'person' : 'people'}`,
      detail: `${report.busFactor.n} ${report.busFactor.n === 1 ? 'contributor owns' : 'contributors own'} ${report.busFactor.share.toFixed(0)}% of the history. Knowledge sharing is a feature.`,
      tone: 'pink',
    });
  }

  return awards;
}

/**
 * @param {Array<any>} list
 * @param {(item: any) => number} score
 * @param {{ min?: number }} [options]
 * @returns {any | null}
 */
function best(list, score, options = {}) {
  const { min = 0 } = options;
  let winner = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const item of list) {
    if (item.commits < min) continue;
    const value = score(item);
    if (Number.isFinite(value) && value > bestScore) {
      bestScore = value;
      winner = item;
    }
  }
  return winner;
}

/**
 * @param {Array<any>} list
 * @param {(item: any) => number} score
 * @param {{ min?: number }} [options]
 * @returns {any | null}
 */
function least(list, score, options = {}) {
  const { min = 0 } = options;
  let winner = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const item of list) {
    if (item.commits < min) continue;
    const value = score(item);
    if (Number.isFinite(value) && value < bestScore) {
      bestScore = value;
      winner = item;
    }
  }
  return winner;
}

/**
 * Share of commits made between midnight and 5am.
 * @param {{ hours: number[], commits: number }} contributor
 */
export function nightShare(contributor) {
  if (!contributor.commits) return 0;
  const night = contributor.hours.slice(0, 5).reduce((a, b) => a + b, 0);
  return percent(night, contributor.commits);
}

/**
 * Share of commits made between 5am and 9am.
 * @param {{ hours: number[], commits: number }} contributor
 */
export function morningShare(contributor) {
  if (!contributor.commits) return 0;
  const morning = contributor.hours.slice(5, 9).reduce((a, b) => a + b, 0);
  return percent(morning, contributor.commits);
}
