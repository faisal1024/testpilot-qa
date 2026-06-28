---
"testpilot-qa": minor
---

Milestone 5C — public alpha hardening and package smoke.

- **Self-contained published CLI:** `testpilot-qa` now bundles the internal `@testpilot/*` workspace
  packages and declares its real npm deps (`commander`, `zod`, `jiti`, `tinyglobby`,
  `@typescript-eslint/parser`). The packed tarball installs and runs without any unpublished
  workspace dependency. The `@testpilot/*` packages are now `private` so **only `testpilot-qa`
  publishes** (they are bundled, not shipped as separate npm packages).
- **`pnpm smoke:package`** (`scripts/smoke-package.mjs`): packs the CLI, installs the tarball into a
  fresh temp project, and runs the installed binary (`--help`/`--version`, `explain --json`, `init`
  + AI guidance + overwrite protection, `doctor`, `analyze`). Proves the install path a consumer
  gets. Offline after the one registry install; no browsers.
- **`analyze <dir>`**: a positional that is a directory is expanded into its test files, so
  `analyze examples/fragile-suite` works.
- **`examples/fragile-suite/`**: a small, intentionally-fragile spec (XPath, CSS class, hard wait, +
  one good locator) with a README, used to demonstrate `analyze` output. `smoke:mvp` now asserts the
  expected rules fire on it.
- Docs: README repositioned as an honest public alpha; `docs/Release-Checklist.md` adds
  `smoke:package` (and how it differs from `smoke:mvp`) + the dependency-PR strategy;
  `docs/Adoption-Plan.md` marks 5C active.

Still alpha scope — no auto-fix, DOM-aware analysis, baseline/SARIF/GitHub Action, HTML report, MCP,
dashboards, or LLM calls.
