---
"testpilot-qa": minor
"@testpilot/core": minor
"@testpilot/locator-intelligence": minor
---

Phase 9b/9d — **TestPilot finds the suite Playwright actually runs**, and `doctor` stops reporting on
projects that never adopted TestPilot.

- **Playwright-config fallback.** When `testpilot.config.ts` doesn't set `testDir` (or doesn't exist),
  discovery reads `testDir`, `testMatch`, and `testIgnore` from `playwright.config.*` — including
  `.cjs`/`.js` files using `module.exports`. This covers the shapes real suites use: settings declared
  under **`projects[]`**, **`RegExp` matchers** (applied to absolute paths as Playwright applies them,
  not mistranslated into globs), and a config kept in a sub-directory such as `e2e/`. Verified against
  the cal.com and immich configurations, which previously matched zero files.
- **Each `projects[]` entry is its own scope** — a root plus the selectors that apply to it, inheriting
  the top level. One project's `testIgnore` can no longer delete another project's files.
- **The Playwright config is parsed, never executed.** `analyze` is advertised as static and offline
  and is routinely pointed at a repository you're only evaluating; running that repo's config could
  write to stdout (corrupting `--json`), call `process.exit` (colliding with the gate-failure exit
  code), hang, or need `@playwright/test` to be installed. Anything not statically knowable — a
  computed value, a spread from another object — is reported as such rather than guessed at.
- **`testDir` and `testMatch` are adopted as a pair**, so a project scaffolded by `testpilot init`
  (which sets `testDir` and not `include`) keeps analyzing exactly the files it did before.
- **Fixed: `node_modules` is now always skipped.** Setting `exclude` in `testpilot.config.ts` replaces
  the defaults, which previously removed the dependency guard — with a broad `testDir`, `analyze`
  could score dependency code and `fix --write` could rewrite it.
- **It tells you.** When the fallback supplies a setting, `analyze`/`fix` name the directories being
  scanned on stderr; when a Playwright config is found but can't be used, the reason appears in the
  zero-file error, in a new `doctor` check, and in the report. `--no-playwright-discovery` turns the
  fallback off for `analyze`, `fix`, and `doctor` alike.
- **Report schema `1.5`:** new top-level `discovery` — per-setting provenance
  (`testpilot-config` | `playwright-config` | `default`), the `roots` actually scanned,
  `playwrightConfigPath`, and `playwrightConfigIgnored`. Reported paths always stay inside `rootDir`
  (re-anchored when an adopted `testDir` points outside it), so SARIF URIs never contain `..`.
- **Doctor schema `1.1`:** `checks` is now variable-length. `ai-guidance` is omitted on a project
  without a `testpilot.config.ts` (running `doctor` on someone else's repo reported four missing files
  that were never theirs) — pass `--strict-guidance` to check anyway. A `playwright-discovery` check
  appears only when a Playwright config was found and could not be used. `test-directory` names the
  directories discovery actually resolved, and gained `details`.
