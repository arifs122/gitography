/**
 * Turns the raw dataset from `collect()` into the metrics consumed by every
 * renderer.
 *
 * The output is a plain, JSON-serialisable object (see the JSDoc of
 * `analyze()`), which is why `--format json` is essentially a no-op: the
 * analysis *is* the product.
 */

import { languageOf, isCode } from './languages.js';
import {
  addDays,
  clamp,
  daysBetween,
  humanDuration,
  isoDay,
  isoHour,
  isoWeekday,
  median,
  percent,
  sum,
  weekStart,
} from './util.js';
import { computeAwards } from './awards.js';

const CONVENTIONAL_TYPES = [
  'feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test',
  'build', 'ci', 'chore', 'revert', 'wip', 'merge', 'release',
];

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'for', 'to', 'of',
  'in', 'on', 'at', 'by', 'with', 'from', 'into', 'as', 'is', 'are', 'was',
  'were', 'be', 'been', 'being', 'it', 'its', 'this', 'that', 'these', 'those',
  'i', 'we', 'you', 'they', 'he', 'she', 'not', 'no', 'yes', 'do', 'does',
  'did', 'done', 'can', 'could', 'should', 'would', 'will', 'just', 'now',
  'use', 'used', 'using', 'make', 'made', 'add', 'added', 'adds', 'remove',
  'removed', 'removes', 'update', 'updated', 'updates', 'fix', 'fixed', 'fixes',
  'fixing', 'change', 'changed', 'changes', 'new', 'more', 'less', 'also',
  'when', 'where', 'which', 'what', 'who', 'how', 'why', 'all', 'any', 'some',
  'only', 'other', 'than', 'over', 'after', 'before', 'up', 'down', 'out',
  'get', 'set', 'let', 'run', 'work', 'works', 'working', 'support', 'better',
  'minor', 'typo', 'typos', 'test', 'tests', 'testing', 'issue', 'issues',
  'pr', 'merge', 'branch', 'commit', 'commits', 'revert', 'bump', 'version',
  'release', 'chore', 'docs', 'doc', 'refactor', 'style', 'perf', 'build',
  'ci', 'feat', 'initial', 'v1', 'v2', 'readme', 'skip', 'again', 'still',
  'one', 'two', 'first', 'last', 'next', 'via', 'per', 'due', 'because',
  'instead', 'without', 'about', 'between', 'theyre', 'thats', 'dont', 'doesnt',
]);

/** Commit-size histogram buckets, in lines changed. */
const CHURN_BUCKETS = [
  { label: '1–10', min: 1, max: 10 },
  { label: '11–50', min: 11, max: 50 },
  { label: '51–200', min: 51, max: 200 },
  { label: '201–1k', min: 201, max: 1000 },
  { label: '1k–5k', min: 1001, max: 5000 },
  { label: '5k+', min: 5001, max: Infinity },
];

/**
 * Normalise a contributor identity. We key on email because the same person
 * often commits under slightly different display names; when there is no email
 * we fall back to the name.
 * @param {{ author: string, email: string }} commit
 */
function identityKey(commit) {
  const email = (commit.email || '').trim().toLowerCase();
  if (email) return email;
  return (commit.author || 'unknown').trim().toLowerCase();
}

/**
 * Compute the longest run of consecutive calendar days in a sorted day list.
 * @param {string[]} days sorted ascending, unique
 * @returns {{ length: number, start: string | null, end: string | null }}
 */
function longestStreak(days) {
  let best = { length: 0, start: null, end: null };
  let runStart = null;
  let runLength = 0;
  let previous = null;

  for (const day of days) {
    if (previous && daysBetween(previous, day) === 1) {
      runLength += 1;
    } else {
      runStart = day;
      runLength = 1;
    }
    if (runLength > best.length) best = { length: runLength, start: runStart, end: day };
    previous = day;
  }
  return best;
}

/**
 * Length of the streak of active days ending at `days[days.length - 1]`.
 * @param {string[]} days sorted ascending, unique
 */
function trailingStreak(days) {
  if (!days.length) return 0;
  let streak = 1;
  for (let i = days.length - 1; i > 0; i -= 1) {
    if (daysBetween(days[i - 1], days[i]) === 1) streak += 1;
    else break;
  }
  return streak;
}

/**
 * Fill a weekly series with zero-valued entries so charts stay continuous.
 * @param {Map<string, { commits: number, insertions: number, deletions: number }>} map
 * @param {string} firstWeek
 * @param {string} lastWeek
 */
function fillWeeks(map, firstWeek, lastWeek) {
  const weeks = [];
  let cursor = firstWeek;
  let guard = 0;
  while (daysBetween(cursor, lastWeek) >= 0 && guard < 6000) {
    const bucket = map.get(cursor) || { commits: 0, insertions: 0, deletions: 0 };
    weeks.push({ week: cursor, ...bucket });
    cursor = addDays(cursor, 7);
    guard += 1;
  }
  return weeks;
}

/**
 * Build the full analysis report.
 *
 * @param {ReturnType<import('./collect.js').collect>} dataset
 * @param {{ asOf?: Date, topContributors?: number, topHotspots?: number, topLanguages?: number }} [options]
 * @returns {object} report
 */
export function analyze(dataset, options = {}) {
  const {
    topContributors = 15,
    topHotspots = 20,
    topLanguages = 10,
  } = options;

  const commits = dataset.commits ?? [];
  const contentCommits = commits.filter((c) => !c.isMerge);
  const asOf = options.asOf ? new Date(options.asOf) : new Date(dataset.scannedAt || Date.now());

  const warnings = [...(dataset.warnings ?? [])];

  if (!commits.length) {
    return emptyReport(dataset, asOf, warnings);
  }

  const chronological = [...commits].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const first = chronological[0];
  const last = chronological[chronological.length - 1];

  // ---------------------------------------------------------------- activity
  const dailyCount = new Map();
  const weeklyMap = new Map();
  const monthlyMap = new Map();
  const yearlyMap = new Map();
  const punchcard = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const byWeekday = new Array(7).fill(0);
  const byHour = new Array(24).fill(0);

  let insertions = 0;
  let deletions = 0;
  let filesChanged = 0;
  let mergeCount = 0;
  let binaryFiles = 0;
  const touchedFiles = new Set();
  const churnHistogram = CHURN_BUCKETS.map((bucket) => ({ label: bucket.label, count: 0 }));

  for (const commit of chronological) {
    const day = isoDay(commit.date);
    const hour = isoHour(commit.date);
    const weekday = isoWeekday(commit.date);
    const week = weekStart(day);
    const month = day.slice(0, 7);
    const year = day.slice(0, 4);

    dailyCount.set(day, (dailyCount.get(day) ?? 0) + 1);
    byWeekday[weekday] += 1;
    byHour[hour] += 1;
    punchcard[weekday][hour] += 1;

    bump(weeklyMap, week, commit);
    bump(monthlyMap, month, { insertions: commit.insertions, deletions: commit.deletions });
    bump(yearlyMap, year, { insertions: commit.insertions, deletions: commit.deletions });

    insertions += commit.insertions;
    deletions += commit.deletions;
    filesChanged += commit.filesChanged;
    binaryFiles += commit.binaryFiles;
    if (commit.isMerge) mergeCount += 1;

    for (const file of commit.files) touchedFiles.add(file.path);

    const bucket = CHURN_BUCKETS.find((b) => commit.churn >= b.min && commit.churn <= b.max);
    if (bucket && !commit.isMerge) churnHistogram[CHURN_BUCKETS.indexOf(bucket)].count += 1;
  }

  const activeDays = [...dailyCount.keys()].sort();
  const firstDay = activeDays[0];
  const lastDay = activeDays[activeDays.length - 1];
  const spanDays = Math.max(1, daysBetween(firstDay, lastDay) + 1);

  const weekly = fillWeeks(weeklyMap, weekStart(firstDay), weekStart(lastDay));

  const busyDays = [...dailyCount.entries()].sort((a, b) => b[1] - a[1]);
  const busiestDay = busyDays.length ? { date: busyDays[0][0], count: busyDays[0][1] } : null;

  // Longest gap between consecutive active days.
  let longestGap = { days: 0, from: null, to: null };
  for (let i = 1; i < activeDays.length; i += 1) {
    const gap = daysBetween(activeDays[i - 1], activeDays[i]);
    if (gap > longestGap.days) longestGap = { days: gap, from: activeDays[i - 1], to: activeDays[i] };
  }

  const streaks = {
    longest: longestStreak(activeDays),
    current: trailingStreak(activeDays),
    longestGap: longestGap.days > 1 ? longestGap : null,
  };

  // Cumulative weekly line for the growth chart.
  let running = 0;
  const cumulative = weekly.map((w) => {
    running += w.commits;
    return { week: w.week, commits: running };
  });

  // ------------------------------------------------------------------ people
  /** @type {Map<string, any>} */
  const people = new Map();
  for (const commit of chronological) {
    const key = identityKey(commit);
    let person = people.get(key);
    if (!person) {
      person = {
        id: key,
        names: new Map(),
        email: commit.email || '',
        commits: 0,
        merges: 0,
        insertions: 0,
        deletions: 0,
        files: new Set(),
        days: new Set(),
        years: new Map(),
        hours: new Array(24).fill(0),
        weekend: 0,
        night: 0,
        fixes: 0,
        feats: 0,
        subjectLengths: [],
        firstDate: commit.date,
        lastDate: commit.date,
      };
      people.set(key, person);
    }

    const day = isoDay(commit.date);
    const hour = isoHour(commit.date);
    const weekday = isoWeekday(commit.date);
    const year = day.slice(0, 4);

    person.names.set(commit.author, (person.names.get(commit.author) ?? 0) + 1);
    person.commits += 1;
    if (commit.isMerge) person.merges += 1;
    person.insertions += commit.insertions;
    person.deletions += commit.deletions;
    for (const file of commit.files) person.files.add(file.path);
    person.days.add(day);
    person.years.set(year, (person.years.get(year) ?? 0) + 1);
    person.hours[hour] += 1;
    if (weekday === 0 || weekday === 6) person.weekend += 1;
    if (hour < 5) person.night += 1;
    if (/\bfix(e[sd])?\b|\bbug/i.test(commit.subject)) person.fixes += 1;
    if (/^feat(\(|:)/i.test(commit.subject)) person.feats += 1;
    person.subjectLengths.push(commit.subject.length);
    if (commit.date < person.firstDate) person.firstDate = commit.date;
    if (commit.date > person.lastDate) person.lastDate = commit.date;
  }

  const contributors = [...people.values()]
    .map((person) => {
      const sortedDays = [...person.days].sort();
      const name = pickDisplayName(person.names);
      const years = [...person.years.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
      return {
        id: person.id,
        name,
        email: person.email,
        commits: person.commits,
        merges: person.merges,
        insertions: person.insertions,
        deletions: person.deletions,
        churn: person.insertions + person.deletions,
        filesTouched: person.files.size,
        activeDays: person.days.size,
        share: percent(person.commits, commits.length),
        weekend: person.weekend,
        weekendShare: percent(person.weekend, person.commits),
        nightShare: percent(person.night, person.commits),
        fixes: person.fixes,
        feats: person.feats,
        avgSubjectLength: person.subjectLengths.length
          ? Math.round(sum(person.subjectLengths) / person.subjectLengths.length)
          : 0,
        longestStreak: longestStreak(sortedDays).length,
        firstDate: person.firstDate,
        lastDate: person.lastDate,
        hours: person.hours,
        byYear: years.map(([year, count]) => ({ year, count })),
      };
    })
    .sort((a, b) => b.commits - a.commits || b.churn - a.churn);

  const busFactor = computeBusFactor(contributors, commits.length, dataset.mergeCommitsAll ?? mergeCount);

  // ---------------------------------------------------------------- hotspots
  /** @type {Map<string, any>} */
  const fileStats = new Map();
  for (const commit of contentCommits) {
    for (const file of commit.files) {
      let stat = fileStats.get(file.path);
      if (!stat) {
        stat = {
          path: file.path,
          commits: 0,
          insertions: 0,
          deletions: 0,
          authors: new Set(),
          lastDate: commit.date,
          firstDate: commit.date,
          binary: file.binary,
        };
        fileStats.set(file.path, stat);
      }
      stat.commits += 1;
      stat.insertions += file.added;
      stat.deletions += file.deleted;
      stat.authors.add(commit.email || commit.author);
      if (commit.date > stat.lastDate) stat.lastDate = commit.date;
      if (commit.date < stat.firstDate) stat.firstDate = commit.date;
      if (file.binary) stat.binary = true;
    }
  }

  const hotspots = [...fileStats.values()]
    .map((stat) => ({
      path: stat.path,
      language: languageOf(stat.path) ?? 'Other',
      commits: stat.commits,
      insertions: stat.insertions,
      deletions: stat.deletions,
      churn: stat.insertions + stat.deletions,
      authors: stat.authors.size,
      lastDate: stat.lastDate,
      firstDate: stat.firstDate,
      heat: 0,
    }))
    .sort((a, b) => b.churn - a.churn)
    .slice(0, topHotspots);

  const maxHotspotChurn = hotspots.length ? hotspots[0].churn : 1;
  for (const hotspot of hotspots) hotspot.heat = percent(hotspot.churn, maxHotspotChurn);

  // A file is "hot" when it changes often across many different people.
  const riskiest = [...fileStats.values()]
    .map((stat) => ({
      path: stat.path,
      score: Math.round(clamp(stat.commits, 0, 200) * (1 + stat.authors.size / 4)),
      commits: stat.commits,
      authors: stat.authors.size,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // --------------------------------------------------------------- languages
  const languageBytes = new Map();
  const languageFiles = new Map();
  for (const file of dataset.files ?? []) {
    const language = languageOf(file.path);
    if (!language) continue;
    languageBytes.set(language, (languageBytes.get(language) ?? 0) + file.size);
    languageFiles.set(language, (languageFiles.get(language) ?? 0) + 1);
  }

  const languageChurn = new Map();
  for (const commit of contentCommits) {
    for (const file of commit.files) {
      const language = languageOf(file.path);
      if (!language) continue;
      languageChurn.set(language, (languageChurn.get(language) ?? 0) + file.added + file.deleted);
    }
  }

  const totalBytes = sum([...languageBytes.values()]);
  const languages = [...languageBytes.entries()]
    .map(([name, size]) => ({
      name,
      bytes: size,
      files: languageFiles.get(name) ?? 0,
      churn: languageChurn.get(name) ?? 0,
      share: percent(size, totalBytes),
      code: isCode(name),
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const codeBytes = sum(languages.filter((l) => l.code), (l) => l.bytes);
  const codeShare = percent(codeBytes, totalBytes);

  // ---------------------------------------------------------------- messages
  const subjects = commits.map((c) => c.subject).filter(Boolean);
  const typeCounts = new Map();
  let conventionalCount = 0;
  let issueRefs = 0;
  let tooLong = 0;
  let emptySubjects = 0;
  const wordCounts = new Map();

  for (const commit of commits) {
    const subject = commit.subject.trim();
    if (!subject) {
      emptySubjects += 1;
      continue;
    }
    const match = /^([a-zA-Z]+)(?:\([^)]*\))?!?:\s/.exec(subject);
    if (match && CONVENTIONAL_TYPES.includes(match[1].toLowerCase())) {
      conventionalCount += 1;
      const type = match[1].toLowerCase();
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    }
    if (/(^|\s)#\d+/.test(subject)) issueRefs += 1;
    if (subject.length > 72) tooLong += 1;

    for (const rawWord of subject.toLowerCase().split(/[^a-z0-9+#._-]+/)) {
      const word = rawWord.replace(/^[-._]+|[-._]+$/g, '');
      if (word.length < 3 || word.length > 24) continue;
      if (STOP_WORDS.has(word)) continue;
      if (/^\d+$/.test(word)) continue;
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    }
  }

  const longestCommit = contentCommits.reduce(
    (best, c) => (c.churn > (best?.churn ?? -1) ? c : best),
    null,
  );
  const longestSubject = subjects.reduce((best, s) => (s.length > (best?.length ?? -1) ? s : best), null);
  const longestSubjectCommit = longestSubject
    ? commits.find((c) => c.subject === longestSubject) ?? null
    : null;

  const messages = {
    total: subjects.length,
    avgLength: subjects.length ? Math.round(sum(subjects, (s) => s.length) / subjects.length) : 0,
    medianLength: Math.round(median(subjects.map((s) => s.length))),
    conventional: {
      count: conventionalCount,
      share: percent(conventionalCount, commits.length),
      types: [...typeCounts.entries()]
        .map(([type, count]) => ({ type, count, share: percent(count, conventionalCount) }))
        .sort((a, b) => b.count - a.count),
    },
    issueRefs,
    issueRefShare: percent(issueRefs, commits.length),
    tooLong,
    emptySubjects,
    topWords: [...wordCounts.entries()]
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 24),
    longest: longestSubjectCommit
      ? { subject: longestSubjectCommit.subject, author: longestSubjectCommit.author, sha: longestSubjectCommit.shortSha }
      : null,
    biggest: longestCommit
      ? {
        sha: longestCommit.shortSha,
        subject: longestCommit.subject,
        author: longestCommit.author,
        date: longestCommit.date,
        insertions: longestCommit.insertions,
        deletions: longestCommit.deletions,
        files: longestCommit.filesChanged,
      }
      : null,
    firstCommit: first
      ? { sha: first.shortSha, subject: first.subject, author: first.author, date: first.date }
      : null,
    latestCommit: last
      ? { sha: last.shortSha, subject: last.subject, author: last.author, date: last.date }
      : null,
  };

  // ---------------------------------------------------------------- velocity
  const dayKeys = [...dailyCount.keys()];
  const lastDayMs = toMs(lastDay);
  const window = (days) => {
    const from = lastDayMs - days * 86_400_000;
    return dayKeys.reduce((count, day) => (toMs(day) > from ? count + dailyCount.get(day) : count), 0);
  };
  const velocity = {
    last7: window(7),
    last30: window(30),
    last90: window(90),
    last365: window(365),
    perWeek: commits.length / Math.max(1, spanDays / 7),
    perMonth: commits.length / Math.max(1, spanDays / 30.44),
  };

  const yearly = [...yearlyMap.entries()]
    .map(([year, data]) => ({ year, commits: data.commits, insertions: data.insertions, deletions: data.deletions }))
    .sort((a, b) => (a.year < b.year ? -1 : 1));

  const monthly = [...monthlyMap.entries()]
    .map(([month, data]) => ({ month, commits: data.commits, insertions: data.insertions, deletions: data.deletions }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));

  const report = {
    schemaVersion: 1,
    repository: {
      name: dataset.name,
      owner: dataset.owner,
      root: dataset.root,
      branch: dataset.branch,
      head: dataset.shortHead,
      remoteUrl: dataset.remoteUrl,
      webUrl: dataset.remoteWebUrl,
      isShallow: dataset.isShallow,
      gitVersion: dataset.gitVersion,
      tags: dataset.tags,
      branchCount: dataset.branchCount,
    },
    range: {
      first: first.date,
      last: last.date,
      firstDay,
      lastDay,
      days: spanDays,
      age: humanDuration(spanDays),
      asOf: asOf.toISOString(),
    },
    totals: {
      commits: commits.length,
      mergeCommits: mergeCount,
      allCommits: dataset.totalCommitsAll || commits.length,
      allMergeCommits: dataset.mergeCommitsAll ?? 0,
      contributors: contributors.length,
      filesTouched: touchedFiles.size,
      filesTracked: (dataset.files ?? []).length,
      insertions,
      deletions,
      churn: insertions + deletions,
      binaryFiles,
      activeDays: activeDays.length,
      activityRate: percent(activeDays.length, spanDays),
      avgCommitsPerActiveDay: activeDays.length ? commits.length / activeDays.length : 0,
      avgLinesPerCommit: commits.length ? (insertions + deletions) / commits.length : 0,
      avgFilesPerCommit: commits.length ? filesChanged / commits.length : 0,
      tags: dataset.tags?.total ?? 0,
    },
    activity: {
      daily: [...dailyCount.entries()].map(([day, count]) => ({ day, count })).sort((a, b) => (a.day < b.day ? -1 : 1)),
      weekly,
      monthly,
      yearly,
      punchcard,
      byWeekday,
      byHour,
      cumulative,
      churnHistogram,
      busiestDay,
      streaks,
      peakHour: byHour.indexOf(Math.max(...byHour)),
      peakWeekday: byWeekday.indexOf(Math.max(...byWeekday)),
    },
    velocity,
    busFactor,
    contributors: contributors.slice(0, topContributors),
    contributorCount: contributors.length,
    contributorShare: percent(
      sum(contributors.slice(0, topContributors), (c) => c.commits),
      commits.length,
    ),
    hotspots,
    riskiest,
    languages: languages.slice(0, topLanguages),
    languageCount: languages.length,
    codeShare,
    messages,
    warnings,
  };

  report.awards = computeAwards(report, contributors);
  return report;
}

/**
 * @param {Map<string, any>} map
 * @param {string} key
 * @param {{ insertions: number, deletions: number }} commit
 */
function bump(map, key, commit) {
  const bucket = map.get(key) ?? { commits: 0, insertions: 0, deletions: 0 };
  bucket.commits += 1;
  bucket.insertions += commit.insertions ?? 0;
  bucket.deletions += commit.deletions ?? 0;
  map.set(key, bucket);
}

/**
 * Pick the most frequently used display name, breaking ties alphabetically so
 * output is deterministic.
 * @param {Map<string, number>} names
 */
function pickDisplayName(names) {
  return [...names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'Unknown';
}

/**
 * Minimal number of contributors responsible for 50% of all commits — the
 * classic "what happens if these people win the lottery" metric.
 * @param {Array<any>} contributors sorted by commits desc
 * @param {number} totalCommits
 * @param {number} mergeCommits
 */
function computeBusFactor(contributors, totalCommits, mergeCommits) {
  const total = totalCommits || 1;
  const people = [];
  let covered = 0;
  for (const person of contributors) {
    if (covered / total >= 0.5) break;
    people.push({ name: person.name, commits: person.commits, share: percent(person.commits, total) });
    covered += person.commits;
  }
  const topShare = contributors.length ? percent(contributors[0].commits, total) : 0;
  return {
    n: people.length,
    share: percent(covered, total),
    people,
    mergeCommits,
    topShare,
    risk: topShare >= 80 ? 'high' : topShare >= 50 ? 'medium' : 'low',
  };
}

/** @param {string} dayKey */
function toMs(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Report shape for repositories with no commits at all.
 * @param {object} dataset
 * @param {Date} asOf
 * @param {string[]} warnings
 */
function emptyReport(dataset, asOf, warnings) {
  return {
    schemaVersion: 1,
    repository: {
      name: dataset.name,
      owner: dataset.owner,
      root: dataset.root,
      branch: dataset.branch,
      head: dataset.shortHead,
      remoteUrl: dataset.remoteUrl,
      webUrl: dataset.remoteWebUrl,
      isShallow: dataset.isShallow,
      gitVersion: dataset.gitVersion,
      tags: dataset.tags,
      branchCount: dataset.branchCount,
    },
    range: {
      first: null, last: null, firstDay: null, lastDay: null,
      days: 0, age: '0 days', asOf: asOf.toISOString(),
    },
    totals: {
      commits: 0, mergeCommits: 0, allCommits: 0, allMergeCommits: 0,
      contributors: 0, filesTouched: 0, filesTracked: (dataset.files ?? []).length,
      insertions: 0, deletions: 0, churn: 0, binaryFiles: 0, activeDays: 0,
      activityRate: 0, avgCommitsPerActiveDay: 0, avgLinesPerCommit: 0,
      avgFilesPerCommit: 0, tags: dataset.tags?.total ?? 0,
    },
    activity: {
      daily: [], weekly: [], monthly: [], yearly: [], punchcard: Array.from({ length: 7 }, () => new Array(24).fill(0)),
      byWeekday: new Array(7).fill(0), byHour: new Array(24).fill(0), cumulative: [],
      churnHistogram: CHURN_BUCKETS.map((b) => ({ label: b.label, count: 0 })),
      busiestDay: null,
      streaks: { longest: { length: 0, start: null, end: null }, current: 0, longestGap: null },
      peakHour: 0, peakWeekday: 0,
    },
    velocity: { last7: 0, last30: 0, last90: 0, last365: 0, perWeek: 0, perMonth: 0 },
    busFactor: { n: 0, share: 0, people: [], mergeCommits: 0, topShare: 0, risk: 'low' },
    contributors: [],
    contributorCount: 0,
    contributorShare: 0,
    hotspots: [],
    riskiest: [],
    languages: [],
    languageCount: 0,
    codeShare: 0,
    messages: {
      total: 0, avgLength: 0, medianLength: 0,
      conventional: { count: 0, share: 0, types: [] },
      issueRefs: 0, issueRefShare: 0, tooLong: 0, emptySubjects: 0,
      topWords: [], longest: null, biggest: null, firstCommit: null, latestCommit: null,
    },
    awards: [],
    warnings: [
      ...warnings,
      'This repository has no commits yet — nothing to visualise. Make a first commit and try again!',
    ],
  };
}

export { CONVENTIONAL_TYPES, CHURN_BUCKETS };
