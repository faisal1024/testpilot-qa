---
"testpilot-qa": minor
"@testpilot/core": minor
"@testpilot/locator-intelligence": minor
---

Post-alpha fix: a run that analyzes **zero files is no longer a silent pass**.

- **Breaking (CLI behaviour):** `analyze` and `fix` now fail when no test files match — exit `2` for
  explicit patterns, exit `3` for config-driven discovery — with a message that says what was
  searched and how to fix it. Previously a JavaScript suite (or a wrong `testDir`) scored
  `100 (A)` over 0 call-sites and passed `--min-score`.
- **Default `include` now covers JavaScript suites:** `**/*.{spec,test,e2e,e2e-spec}.{ts,tsx,js,jsx,mjs,cjs}` (was `*.spec.ts`/`*.test.ts` only —
  cal.com's `*.e2e.ts` and immich's `*.e2e-spec.ts` suites matched nothing). Explicit `include` values in your config are unchanged.
- **Default `exclude`** (new config key): `node_modules`, `dist`, `build`, `coverage`, `test-results`,
  `playwright-report` — so a compiled copy of a TypeScript suite is not analyzed twice now that `.js`
  is in the default include. It applies wherever `include` chose the files (config-driven discovery and
  directory arguments); a glob or path you name explicitly is still honored, so
  `analyze dist/e2e/a.spec.js` works. Setting `exclude` replaces the defaults.
- **Monorepo-friendly discovery — behaviour change:** `testDir` resolves relative to the directory of
  the loaded `testpilot.config.ts` — or, with no config file, the project root (nearest `package.json`)
  — rather than the current working directory, for `analyze`, `fix`, and `doctor` alike, so `doctor`
  always predicts what `analyze` will do; reported file paths (`findings[].file`, `fix` output, baseline identities) are
  relative to it too. Explicit CLI patterns still resolve from `--cwd`. **Migration:** if you relied
  on running from a sub-directory with a *parent* config to analyze the sub-directory's own `tests/`,
  pass explicit patterns or a per-package `--config`; if you used `--config packages/web/testpilot.config.ts`
  with a root-relative `testDir: 'packages/web/tests'`, change it to `testDir: 'tests'`. Baselines
  recorded from a sub-directory before this release should be re-recorded.
- **SARIF paths are unchanged:** `artifactLocation.uri` stays relative to `--cwd` (re-resolved from
  the new `rootDir`), so the GitHub Action's repo-root contract still holds.
- **Report schema `1.4`:** adds top-level `rootDir` (absolute base of reported paths) and the
  `no-files-matched` warning code. On a zero-file run, `--json` and `--reporter sarif` output is still
  emitted (with the warning, `filesAnalyzed: 0`) before the non-zero exit, so `upload-sarif` with
  `if: always()` keeps working; the table/HTML reporters print only the error. The programmatic
  `analyze()` API warns rather than throws.
- `--verbose` prints the resolved discovery base (`[testpilot] files: N under <dir>`); `rootDir` in the
  JSON report is always absolute.
- **AI guidance is now v2:** the generated agent globs follow the widened default `include`, so JS and
  `*.e2e.ts` suites are covered. After upgrading, `doctor` reports your existing guidance files as
  **stale** — run `testpilot add ai` to preview and `testpilot add ai --write` to refresh them
  (hand-edited files still need `--force`).
- **Rule docs are real now:** every `docsUrl` (CLI, SARIF `helpUri`, HTML report) points at
  `docs/rules/<rule-id>.md` in this repository instead of the unowned `testpilot.dev` domain. The
  pages are generated from the same source as `testpilot explain` (`pnpm docs:rules`).
- `doctor` no longer describes `testpilot add ai` as unshipped; its drift remediation now names the
  command to run.
- `testpilot-qa` declares `engines.node >= 20` so unsupported installs warn up front.
