---
"testpilot-qa": minor
"@testpilot/core": minor
"@testpilot/locator-intelligence": minor
---

Run tests by tag, and see what tags exist.

- **`testpilot run --tag <tags>`** runs tests carrying any of those tags; `--exclude-tag` (or a `!`
  prefix) excludes. Selection compiles to Playwright's own `--grep` / `--grep-invert` and the
  compiled flags are printed, so generated projects stay ejectable and `run` stays a pass-through.
  The boundary assertions match Playwright's own tag tokenization, so `--tag smoke` does **not** run
  `@smoketest` and `--tag team` does **not** run `@team:auth` — the mistake hand-written `--grep`
  invites.
- **`suites` config key + `--suite <name>`** names the sets you actually run, e.g.
  `suites: { nightly: ['regression', '!flaky'] }`. An unknown suite exits `2` and lists the real
  ones; a tag both included and excluded exits `2`; combining `--tag` with a forwarded `--grep`
  exits `2` rather than letting Playwright silently keep only one of the two filters.
- **`testpilot tags`** statically lists the tag vocabulary with per-tag test and file counts, the
  untagged count, and each configured suite resolved against the real vocabulary. It reads tags from
  both places Playwright does (`@tag` in the title and the `{ tag: [...] }` details argument) and
  applies `test.describe` tags to the tests nested inside. New `--json` contract,
  `schemaVersion` `1.0`.
- **`doctor` gains a `suites` check.** An empty or malformed suite fails; a suite referencing a tag
  no test carries warns. A typo in `suites` previously ran zero tests and exited `0`.
- **Fix:** `analyze` and `fix` no longer warn that a `testDir` is missing when explicit patterns were
  passed — discovery never consulted it, so the warning named the wrong directory.
