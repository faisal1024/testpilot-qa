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
- **Monorepo-friendly discovery:** `testDir` resolves relative to the directory of the loaded
  `testpilot.config.ts` (not the current working directory), and reported file paths are relative to
  it too. Explicit CLI patterns still resolve from `--cwd`.
- **Report schema `1.4`:** `warnings[]` gains the `no-files-matched` code (the programmatic
  `analyze()` API warns rather than throws).
- **Rule docs are real now:** every `docsUrl` (CLI, SARIF `helpUri`, HTML report) points at
  `docs/rules/<rule-id>.md` in this repository instead of the unowned `testpilot.dev` domain. The
  pages are generated from the same source as `testpilot explain` (`pnpm docs:rules`).
- `doctor` no longer describes `testpilot add ai` as unshipped; its drift remediation now names the
  command to run.
- `testpilot-qa` declares `engines.node >= 20` so unsupported installs warn up front.
