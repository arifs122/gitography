import assert from 'node:assert/strict';
import test from 'node:test';

import { analyze } from '../src/analyze.js';
import { commit, dataset, sampleDataset } from './helpers.js';

test('empty repositories produce a valid, flagged report', () => {
  const report = analyze(dataset([]));
  assert.equal(report.totals.commits, 0);
  assert.equal(report.totals.contributors, 0);
  assert.equal(report.contributors.length, 0);
  assert.equal(report.hotspots.length, 0);
  assert.equal(report.awards.length, 0);
  assert.equal(report.activity.weekly.length, 0);
  assert.equal(report.activity.punchcard.length, 7);
  assert.equal(report.activity.punchcard[0].length, 24);
  assert.equal(report.warnings.length, 1);
  assert.match(report.warnings[0], /no commits yet/i);
});

test('totals, range and streaks are computed correctly', () => {
  const report = analyze(sampleDataset());

  assert.equal(report.totals.commits, 3);
  assert.equal(report.totals.contributors, 2);
  assert.equal(report.totals.insertions, 100 + 10 + 3 + 40);
  assert.equal(report.totals.deletions, 5 + 0 + 3 + 1);
  assert.equal(report.totals.activeDays, 3);
  assert.equal(report.range.firstDay, '2023-01-15');
  assert.equal(report.range.lastDay, '2023-01-17');
  assert.equal(report.range.days, 3);

  assert.equal(report.activity.streaks.longest.length, 3);
  assert.equal(report.activity.streaks.longest.start, '2023-01-15');
  assert.equal(report.activity.streaks.current, 3);
  assert.equal(report.activity.busiestDay.count, 1);
  assert.equal(report.activity.weekly.length, 2, 'Jan 15 falls in the week of Jan 9');
  assert.equal(report.activity.weekly[0].commits, 1);
  assert.equal(report.activity.weekly[1].commits, 2);
  assert.equal(report.activity.cumulative.at(-1).commits, 3);
});

test('punchcard and hour/weekday distributions line up', () => {
  const report = analyze(sampleDataset());
  const { punchcard, byHour, byWeekday, peakHour, peakWeekday } = report.activity;

  const punchTotal = punchcard.flat().reduce((a, b) => a + b, 0);
  assert.equal(punchTotal, 3);
  assert.equal(byHour.reduce((a, b) => a + b, 0), 3);
  assert.equal(byWeekday.reduce((a, b) => a + b, 0), 3);
  assert.equal(byHour[22], 1, 'Ada committed at 22:00');
  assert.equal(byHour[2], 1, 'Ada committed at 02:00');
  assert.equal(byHour[9], 1, 'Grace committed at 09:00');
  assert.equal(byHour[peakHour], Math.max(...byHour));
  assert.equal(byWeekday[peakWeekday], Math.max(...byWeekday));
});

test('contributors are merged by email, ranked, and described', () => {
  const data = dataset([
    commit({ sha: '1'.repeat(40), author: 'Ada Lovelace', email: 'ada@example.com', date: '2023-01-15T01:00:00Z', subject: 'fix: a' }),
    commit({ sha: '2'.repeat(40), author: 'ada lovelace', email: 'ada@example.com', date: '2023-01-16T02:00:00Z', subject: 'fix: b' }),
    commit({ sha: '4'.repeat(40), author: 'Ada Lovelace', email: 'ada@example.com', date: '2023-01-18T03:00:00Z', subject: 'fix: c' }),
    commit({ sha: '3'.repeat(40), author: 'Grace', email: 'grace@example.com', date: '2023-01-17T09:00:00Z', subject: 'feat: c' }),
  ]);

  const report = analyze(data);
  assert.equal(report.contributorCount, 2, 'three commits share one email, so only two people exist');

  const [first, second] = report.contributors;
  assert.equal(first.commits, 3);
  assert.equal(first.email, 'ada@example.com');
  assert.equal(first.name, 'Ada Lovelace', 'the most frequent display name wins');
  assert.equal(Number(first.share.toFixed(1)), 75);
  assert.equal(first.nightShare, 100, 'all three commits were between midnight and 5am');
  assert.equal(first.fixes, 3);
  assert.equal(second.commits, 1);
  assert.equal(second.name, 'Grace');
  assert.equal(second.feats, 1);
  assert.equal(Number(second.share.toFixed(1)), 25);
});

test('bus factor, hotspots and language composition', () => {
  const report = analyze(sampleDataset());

  assert.equal(report.busFactor.n, 1);
  assert.equal(Number(report.busFactor.share.toFixed(1)), 66.7);
  assert.equal(report.busFactor.risk, 'medium');
  assert.equal(report.busFactor.people[0].name, 'Ada Lovelace');

  const paths = report.hotspots.map((hotspot) => hotspot.path);
  assert.equal(paths[0], 'src/index.js');
  assert.deepEqual(paths, ['src/index.js', 'README.md', 'src/util.js']);

  assert.equal(report.languages[0].name, 'JavaScript');
  assert.equal(report.languages[0].bytes, 6144);
  assert.equal(Number(report.languages[0].share.toFixed(1)), 85.7);
  assert.equal(report.languages.some((language) => language.name === 'Other'), false, 'png is skipped');

  // 6144 of 7168 total bytes are code (Markdown is not).
  assert.equal(Number(report.codeShare.toFixed(1)), 85.7);
});

test('commit message analysis counts prefixes, refs and words', () => {
  const report = analyze(sampleDataset());
  const messages = report.messages;

  assert.equal(messages.total, 3);
  assert.equal(messages.conventional.count, 3, 'feat, fix and docs are all conventional prefixes');
  assert.equal(Number(messages.conventional.share.toFixed(1)), 100);
  assert.deepEqual(messages.conventional.types.map((type) => type.type).sort(), ['docs', 'feat', 'fix']);
  assert.equal(messages.biggest.subject, 'feat(api): add the thing');
  assert.equal(messages.biggest.insertions, 110);
  assert.equal(messages.firstCommit.subject, 'feat(api): add the thing');
  assert.equal(messages.latestCommit.subject, 'docs: document everything');
  assert.ok(messages.avgLength > 0);
  assert.ok(messages.topWords.length > 0);
  assert.equal(messages.tooLong, 0);
});

test('churn histogram buckets every non-merge commit', () => {
  const report = analyze(sampleDataset());
  const buckets = report.activity.churnHistogram;
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  assert.equal(total, 3);
  assert.equal(buckets.find((bucket) => bucket.label === '1–10').count, 1);
  assert.equal(buckets.find((bucket) => bucket.label === '11–50').count, 1);
  assert.equal(buckets.find((bucket) => bucket.label === '51–200').count, 1);
});

test('merge commits are counted but excluded from churn analysis', () => {
  const data = dataset([
    commit({ sha: '1'.repeat(40), date: '2023-01-15T10:00:00Z', subject: 'feat: a', files: ['src/a.js'] }),
    commit({
      sha: '2'.repeat(40),
      date: '2023-01-16T10:00:00Z',
      subject: 'Merge branch feature',
      parents: ['1'.repeat(40), '3'.repeat(40)],
      files: [],
    }),
  ]);

  const report = analyze(data);
  assert.equal(report.totals.commits, 2);
  assert.equal(report.totals.mergeCommits, 1);
  assert.equal(report.totals.churn, 12);
  assert.equal(report.hotspots.length, 1);
  assert.equal(report.messages.total, 2);
});

test('velocity windows are relative to the newest commit', () => {
  const data = dataset([
    commit({ sha: '1'.repeat(40), date: '2023-01-01T10:00:00Z', subject: 'old' }),
    commit({ sha: '2'.repeat(40), date: '2023-06-24T10:00:00Z', subject: 'recent' }),
    commit({ sha: '3'.repeat(40), date: '2023-06-25T10:00:00Z', subject: 'newest' }),
  ]);

  const report = analyze(data);
  assert.equal(report.velocity.last7, 2);
  assert.equal(report.velocity.last30, 2);
  assert.ok(report.velocity.perWeek > 0);
});

test('awards are produced for a real-looking history', () => {
  const commits = [];
  for (let index = 0; index < 12; index += 1) {
    const day = String(1 + index).padStart(2, '0');
    commits.push(commit({
      sha: `${index}`.padStart(8, 'a').repeat(5),
      author: index % 3 === 0 ? 'Ada Lovelace' : index % 3 === 1 ? 'Grace Hopper' : 'Alan Turing',
      email: `${index % 3}@example.com`,
      date: `2023-03-${day}T${String(index % 24).padStart(2, '0')}:15:00Z`,
      subject: index % 4 === 0 ? `fix: patch ${index}` : `feat: shiny thing ${index}`,
      files: [`src/file-${index % 5}.js`],
    }));
  }

  const report = analyze(dataset(commits));
  const ids = report.awards.map((award) => award.id);
  assert.ok(ids.includes('mvp'));
  assert.ok(ids.includes('marathon'), 'a 12 day streak deserves an award');
  assert.ok(report.awards.length <= 9);
  for (const award of report.awards) {
    assert.ok(award.title && award.headline && award.detail && award.emoji && award.tone);
  }
});

test('warnings from the collector are preserved', () => {
  const report = analyze(dataset([commit({})], { warnings: ['shallow clone'] }));
  assert.deepEqual(report.warnings, ['shallow clone']);
});

test('limits truncate contributors and hotspots without breaking totals', () => {
  const commits = Array.from({ length: 40 }, (_, index) => commit({
    sha: `${index}`.padStart(8, '0').repeat(5),
    email: `dev${index}@example.com`,
    author: `Dev ${index}`,
    date: `2023-05-${String(1 + (index % 28)).padStart(2, '0')}T12:00:00Z`,
    subject: `feat: change ${index}`,
    files: [`src/f${index}.js`],
  }));

  const report = analyze(dataset(commits), { topContributors: 5, topHotspots: 3 });
  assert.equal(report.contributors.length, 5);
  assert.equal(report.contributorCount, 40);
  assert.equal(report.hotspots.length, 3);
  assert.equal(report.totals.commits, 40);
});
