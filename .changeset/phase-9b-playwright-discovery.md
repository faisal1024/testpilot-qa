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
- **Every `projects[]` entry is its own scope** — a root plus the selectors that apply to it,
  inheriting the top level. That includes projects declaring no selectors of their own, as in
  Playwright's documented `setup` pattern (`{ name: 'setup', testMatch: /.*\.setup\.ts/ }` beside
  browser projects with none): those browser projects run the whole suite, and dropping them analyzed
  the setup files alone and printed a clean score over a fraction of the tests. One project's
  `testIgnore` can no longer delete another project's files, and a project whose `testDir` is computed
  is skipped rather than silently scanned at its parent's root.
- **An explicit `include` or `exclude` outranks Playwright's `testMatch`/`testIgnore`**, exactly as an
  explicit `testDir` does — a Playwright glob silently dropping files while every message credited
  `testpilot.config` was the worst of both.
- **Playwright's matchers are applied the way Playwright applies them:** globs and RegExps (with their
  flags) match against the **absolute** path. TestPilot's own `include` keeps its root-relative
  meaning. A config that declares no `testDir` still contributes its own directory, which is
  Playwright's default test root.
- **Nothing is dropped in silence.** A `projects` array built by a function or containing a spread, a
  `defineConfig(base, override)` layered on an imported base, a computed `testDir` — each is still
  used for what *was* readable, with the base test root kept because the entries we cannot see inherit
  it, and the rest reported. Those reports now reach `warnings[]` (schema **1.6**:
  `playwright-config-partial` / `playwright-config-ignored`), so the table, the HTML report, and SARIF
  (`invocations[].toolExecutionNotifications`) all show them — not just stderr, which `--quiet`
  suppresses and shared artifacts never carried.
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
- **`defineConfig(base, override)` is merged per key**, later layers winning, as Playwright merges
  them — and a config assembled from a layer we cannot read no longer synthesizes a test root, which
  had widened the scan to the whole project and scored files Playwright never runs. Only
  `defineConfig`/`mergeConfig` calls are unwrapped: a project-local `makeConfig({...})` can rewrite
  what it is given, so its argument is reported rather than trusted.
- **`exclude` and `testIgnore` both apply.** They are not competing definitions of one thing — adding
  one exclusion never means "also run the suite Playwright skips" — and the provenance is reported as
  `mixed` so you can see which side dropped a file.
- **The success path is disclosed too:** when a Playwright config supplied the test roots, the table
  and the HTML report name the directories scanned and the config they came from, so an adoption that
  is wrong-but-unflagged is visible in the artifacts a team actually reads. `fix --json` carries
  `discovery` and the same warnings — it is the write path and must be at least as loud as `analyze`.
- **A zero-file run publishes an unsuccessful SARIF invocation** with the `no-files-matched`
  notification, instead of a result set indistinguishable from a clean scan.
- **A `playwrightConfig` you set explicitly is honored**: if it points at a file that does not exist,
  discovery stops and says so rather than silently reading a different config.
- **Report schema `1.6`:** new top-level `discovery` — per-setting provenance
  (`testpilot-config` | `playwright-config` | `default`), the `roots` actually scanned,
  `playwrightConfigPath`, and `playwrightConfigIgnored`. `rootDir` stays a pure function of repo
  layout — it anchors baseline identities, so it must not shift when a config gains a project — and a
  test root outside the project is reported with `../`, with SARIF emitting an absolute `file://` URI
  instead (code scanning rejects `..` and drops the upload).
- **Doctor schema `1.1`:** `checks` is now variable-length. `ai-guidance` is omitted on a project
  without a `testpilot.config.ts` (running `doctor` on someone else's repo reported four missing files
  that were never theirs) — pass `--strict-guidance` to check anyway. A `playwright-discovery` check
  appears only when a Playwright config was found and could not be used. `test-directory` names the
  directories discovery actually resolved (and only the ones actually missing), gained `details`, and
  is omitted entirely when the config failed to load. A repo with several Playwright configs is told
  to pick one rather than to add one.
