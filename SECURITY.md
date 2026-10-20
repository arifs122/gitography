# Security policy

## Supported versions

gitography is pre-1.0; the latest published minor version receives fixes.

| Version | Supported |
| --- | --- |
| 0.1.x | yes |

## What gitography does with your data

It is worth stating plainly, because this tool reads your Git history:

- gitography runs **entirely on your machine**. It shells out to the `git`
  binary you already have and reads `.git` metadata plus the file list at
  `HEAD`.
- It makes **no network requests**. There is no update check, no telemetry, no
  crash reporting, no analytics.
- The generated HTML report is a single file with **no external references**.
  Opening it does not fetch anything from anywhere, so a report from an
  internal repository does not leak to a third party.
- Reports do contain author names, email addresses, commit subjects and file
  paths. **Treat a report as sensitive as the repository it describes** before
  sharing it publicly.

## Reporting a vulnerability

Please do not open a public issue for security problems. Instead, use GitHub's
private vulnerability reporting on the repository (Security → Report a
vulnerability) or contact the maintainer directly.

Useful reports include a minimal reproduction, the version you tested, and the
impact you believe the issue has. The most likely classes of issue here are:

- HTML injection through repository-controlled strings (author names, commit
  subjects, file paths) in any of the renderers;
- command injection through the arguments passed to `git`;
- reading files outside the target repository.

All three have tests guarding them today, and reports that demonstrate a gap in
those tests are very welcome.
