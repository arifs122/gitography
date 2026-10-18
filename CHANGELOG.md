# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Nothing yet.

## [0.1.0] — 2026-10-19

### Added

- `gitography` CLI that scans a repository's history through the local `git`
  binary and produces a report.
- Four output formats: `html` (default), `json`, `md` and `text`.
- Self-contained interactive HTML report with a punchcard heatmap, a 53-week
  contribution calendar, a cumulative growth curve, monthly commit columns,
  per-year churn bars, a contributor leaderboard with per-person sparklines,
  a bus-factor panel, hotspot files, language composition, commit-message
  analysis, commit-size distribution and an "awards wall".
- Dark and light themes with a persisted toggle, animated stat counters,
  scroll reveals, `prefers-reduced-motion` support and print styles.
- Hand-built SVG charts — no chart library, no web fonts, no CDN, no trackers.
- Contributor identity merging by email, author-local timezone handling for the
  punchcard and the night-owl statistics.
- Handles shallow clones, merge commits, binary files, rename-free numstat,
  empty repositories and repositories without a remote.
- `--since`, `--until`, `--limit`, `--all`, `--no-merges`, `--top`, `--hot`,
  `--theme`, `--title`, `--subtitle`, `--open`, `--quiet` and `--no-color`.
- Programmatic API: `collect()`, `analyze()`, `renderHtml()`, `renderText()`,
  `renderMarkdown()`.
- 71 tests covering parsing, language detection, statistics, rendering, HTML
  escaping and the CLI, including end-to-end tests against real temporary
  repositories.
- `tools/render-terminal-svg.mjs` to regenerate the README terminal strip.

[Unreleased]: https://github.com/arifs122/gitography/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/arifs122/gitography/releases/tag/v0.1.0
