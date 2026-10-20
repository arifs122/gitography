# Contributing to gitography

Thanks for taking the time to help. This project is deliberately small and
dependency-free, which keeps contributing refreshingly simple.

## Getting started

```bash
git clone https://github.com/arifs122/gitography.git
cd gitography
npm test                 # no install step needed — there are no dependencies
node bin/gitography.js . # try it on itself
```

Node 18 or newer and a working `git` are the only requirements.

## Ground rules

1. **No runtime dependencies.** Ever. The zero-dependency promise is the whole
   point: `npx gitography` must work without a download step, in air-gapped
   environments, and on a repo you do not trust.
2. **No network calls, no telemetry, no CDN links in the generated report.**
   The HTML report must render identically offline. CI checks this.
3. **Escape everything that comes from a repository.** Author names, commit
   subjects and file paths are untrusted input.
4. **Keep it fast.** The full history should be gathered with as few `git`
   invocations as possible; currently one `git log` does all the heavy lifting.

## Adding a metric

Most metrics need four small edits:

1. compute it in `src/analyze.js` (pure data, no formatting);
2. add it to the report shape and to `emptyReport()` so empty repositories keep
   working;
3. render it — `src/render-text.js` for the terminal, `src/render-html.js` for
   the report, `src/render-markdown.js` for the embeddable summary;
4. cover it with a test in `test/analyze.test.js` and, if it is visual, one in
   `test/render.test.js`.

## Regenerating the demo assets

```bash
node bin/gitography.js /path/to/a/repo -o docs/demo/express.html
node bin/gitography.js /path/to/a/repo --format text --no-color > docs/demo/cli.txt
node tools/render-terminal-svg.mjs docs/demo/cli.txt docs/demo/cli.svg
```

## Before you open a pull request

- `npm test` is green;
- you ran the CLI against a real repository, not just the fixtures;
- the HTML report still contains no external references;
- there are no new entries in `dependencies`.

## Adding a language

Language detection lives in a single lookup table in `src/languages.js`. Add the
extension to `EXTENSION_MAP`, add a test to `test/languages.test.js`, and make
sure binary or generated assets stay in `IGNORED_EXTENSIONS`.

## Commit messages

Conventional Commits are appreciated (`feat:`, `fix:`, `docs:`, `test:`,
`refactor:`, `perf:`, `chore:`). The project eats its own dog food — a
`gitography` report of this repository should look tidy.

## Reporting bugs

Open an issue with the exact command you ran, your Node/git versions, and the
warnings gitography printed. Do not attach reports generated from private
repositories without reviewing them first.

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
