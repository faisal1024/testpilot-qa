---
"testpilot-qa": minor
"@testpilot/core": minor
"@testpilot/locator-intelligence": minor
---

Run tests by tag, and see what tags exist.

- **`testpilot run --tag <tags>`** runs tests carrying any of those tags; `--exclude-tag` (or a `!`
  prefix) excludes. Selection compiles to Playwright's own `--grep` / `--grep-invert` and the
  compiled flags are printed, so generated projects stay ejectable and `run` stays a pass-through.
  The compiled value is slash-delimited (`--grep "/…/"`) because Playwright compiles a **bare**
  `--grep` string with the `gi` flags — without the wrapper, `--tag here` would also run `@HERE`.
  Whole-tag boundaries mean `--tag smoke` does not run `@smoketest` and `--tag team` does not run
  `@team:auth`.
- **`suites` config key + `--suite <name>`** names the sets you actually run:
  `suites: { nightly: ['regression', '!flaky'] }`. A list is any-of; the object form
  (`{ any, all, none }`) adds all-of, which a list cannot express. The list form is permanent sugar
  for `any` and will never be reinterpreted.
- **`testpilot tags`** statically lists the tag vocabulary with per-tag test and file counts, **how
  each tag was declared** (title vs `{ tag: [...] }` — the difference between a vocabulary and
  incidental prose Playwright happens to read as a tag), the untagged count, and each configured
  suite resolved against the real vocabulary. New `--json` contract, `schemaVersion` `1.0`, with its
  own warning-code union so `analyze`'s `1.7` contract is unchanged.
- **`doctor` gains a `suites` check** (`DOCTOR_SCHEMA_VERSION` `1.2`). An empty or malformed suite
  fails; a suite referencing a tag no test carries warns. A typo in `suites` previously ran zero
  tests and exited `0`. When the vocabulary cannot be read completely the check says so rather than
  reporting every tag as a typo.
- **Nothing silently selects the wrong set.** Usage errors (exit `2`) for: an unknown suite (lists
  the real ones), a tag both included and excluded, a malformed tag token, an **empty** flag value
  (`--tag "$UNSET_VAR"` must not run everything), more than one `--suite` (two suites cannot fold
  into one include/exclude pair without changing what either selects), and `--tag` combined with a
  forwarded grep flag (`--grep`, `-g`, `-G`, `--flag=value`, `-g@smoke`, and combined clusters such
  as `-xg`, which commander parses as `-x -g`), and `--suite` combined with `--tag` (both choose what
  to include, and neither "either" nor "both" is the obvious reading). `--exclude-tag` still composes
  with `--suite`: narrowing a suite is unambiguous.
- **`tags` discloses its own bounds** in the report, not just on stderr: template-literal titles,
  titles built from a variable, `tag` entries it cannot read statically, files where no `test()` was
  recognized (a renamed import such as `import { test as setup }`), and tags `--tag` cannot select.
  `summary.vocabularyComplete` is the single flag `tags`, `doctor` and the suite counts all key on,
  so they cannot disagree about whether a tag exists: when it is `false`, a tag we did not find is
  reported as *unconfirmed*, never as a typo.
- **Fix:** `analyze` no longer warns that a `testDir` is missing when explicit patterns were passed —
  discovery never consulted it, so the warning named the wrong directory.

Note: adding `suites` to `testpilot.config.ts` makes the config unreadable by `0.1.0-alpha.0`, whose
schema is `.strict()`.
