---
"testpilot-qa": minor
"@testpilot/core": minor
"@testpilot/scaffold": minor
"@testpilot/templates": minor
---

Milestone 2.5 — harden the first-run experience.

- **`testpilot init`** now scaffolds a complete `ui-api-fullstack` TypeScript Playwright project
  (package.json, `playwright.config.ts`, `testpilot.config.ts`, UI + API example tests, `.gitignore`,
  README, GitHub Actions workflow). Never overwrites existing files without `--force`; `--json` output.
- **`testpilot run`** — a thin Playwright pass-through: locates the project, resolves the Playwright
  config, invokes the local Playwright binary, forwards args after `--`, and preserves the exit code.
  Not a custom runner.
- **`@testpilot/core`** adds project discovery (`findProjectRoot`, `findPlaywrightConfig`,
  `resolvePlaywrightBin`) and the injectable Playwright runner. Config gains `playwrightConfig` and
  now **rejects unknown top-level keys**.
- New packages graduate from stubs: **`@testpilot/scaffold`** (file generation, path-safe, overwrite
  protection) and **`@testpilot/templates`** (the template as data).

Generated projects remain ejectable plain Playwright. No Locator Intelligence work included.
