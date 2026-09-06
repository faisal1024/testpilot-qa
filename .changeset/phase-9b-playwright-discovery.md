---
"testpilot-qa": minor
"@testpilot/core": minor
"@testpilot/locator-intelligence": minor
---

Phase 9b/9d — **TestPilot now finds the suite Playwright actually runs**, and `doctor` stops
reporting on projects that never adopted TestPilot.

- **Playwright-config-aware discovery.** With no `testpilot.config.ts` (or with one that doesn't set
  `testDir` / `include`), TestPilot reads `testDir`, `testMatch`, and `testIgnore` from your
  `playwright.config.*`. Suites named `*.e2e.ts` or `*.e2e-spec.ts` — which the built-in globs missed
  entirely — now analyze with no flags and no config. An explicit TestPilot setting always wins,
  per key; `testIgnore` is appended to `exclude` rather than replacing it. A Playwright config that
  can't be loaded here (it imports `@playwright/test`, which may not be installed) is ignored, never
  fatal, and `testMatch: /regex/` is skipped rather than mistranslated into a glob.
- **Report schema `1.5`:** new top-level `discovery` — `{ testDir, include, playwrightConfigPath }`,
  each source being `testpilot-config` | `playwright-config` | `default`. `--verbose` prints the same
  thing in one line, so "why did it look there?" is always answerable.
- **`doctor` names the source** in its test-directory check (`Test directory "e2e" (from
  /path/playwright.config.ts) exists.`), and its remediation for a bare project now says to set
  `testDir` rather than just "create it".
- **`doctor` no longer reports missing AI guidance files on a project without a
  `testpilot.config.ts`** — running it on a repo you're evaluating produced four warnings about
  someone else's project. Pass `--strict-guidance` to check them anyway.
