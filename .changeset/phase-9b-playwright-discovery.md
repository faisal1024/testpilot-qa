---
"testpilot-qa": minor
"@testpilot/core": minor
"@testpilot/locator-intelligence": minor
---

Phase 9b/9d — **TestPilot finds the suite Playwright actually runs**, and `doctor` stops reporting on
projects that never adopted TestPilot.

- **Playwright-config fallback.** When `testpilot.config.ts` doesn't set `testDir` (or doesn't exist),
  discovery reads `testDir`, `testMatch`, and `testIgnore` from `playwright.config.*`. This covers the
  shapes real suites actually use: settings declared under **`projects[]`**, **`RegExp` matchers**
  (applied to absolute paths as Playwright applies them, not mistranslated into globs), and a config
  kept in a sub-directory such as `e2e/`. Verified against the cal.com and immich configurations,
  which previously matched zero files.
- **The Playwright config is parsed, never executed.** `analyze` is advertised as static and offline
  and is routinely pointed at a repository you're only evaluating; running that repo's config could
  write to stdout (corrupting `--json`), call `process.exit`, hang, or need `@playwright/test` to be
  installed. A value that isn't a literal is reported as unusable rather than guessed at.
- **`testDir` and `testMatch` are adopted as a pair** — a project scaffolded by `testpilot init` (which
  sets `testDir` and not `include`) keeps analyzing exactly the files it did before.
- **It tells you.** When the fallback supplies a setting, `analyze`/`fix` say so on stderr; when a
  Playwright config is found but can't be used, the reason appears in the zero-file error, in a new
  `doctor` check, and in the report. `--no-playwright-discovery` turns the fallback off, and explicit
  CLI patterns skip it automatically.
- **Report schema `1.5`:** new top-level `discovery` — per-setting provenance
  (`testpilot-config` | `playwright-config` | `default`), `playwrightConfigPath`, and
  `playwrightConfigIgnored`.
- **Doctor schema `1.1`:** `checks` is now variable-length. `ai-guidance` is omitted on a project
  without a `testpilot.config.ts` (running `doctor` on someone else's repo reported four missing files
  that were never theirs) — pass `--strict-guidance` to check anyway. A `playwright-discovery` check
  appears only when a Playwright config was found and could not be used. `test-directory` gained
  `details` and now names where `testDir` came from.
