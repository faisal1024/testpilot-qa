# @testpilot/templates

## 0.1.0-alpha.2

### Patch Changes

- Updated dependencies [2359e45]
  - @testpilot/core@0.1.0-alpha.2

## 0.1.0-alpha.1

### Patch Changes

- Updated dependencies [161ec18]
- Updated dependencies [719536c]
- Updated dependencies [f059688]
- Updated dependencies [e862495]
- Updated dependencies [25fe129]
- Updated dependencies [cc10177]
- Updated dependencies [acc76ad]
- Updated dependencies [2fbee55]
- Updated dependencies [9c3233a]
  - @testpilot/core@0.1.0-alpha.1

## 0.1.0-alpha.0

### Minor Changes

- 1afb2a5: Milestone 2.5 — harden the first-run experience.

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

- 33cf0fa: Milestone 3.5 — Parallel execution foundation + better sample tests (generated projects).

  - The generated `playwright.config.ts` makes parallelism explicit: keeps `fullyParallel: true` and
    adds a documented `workers: process.env.CI ? 2 : undefined` (conservative in CI, Playwright's
    default locally; override with `--workers`).
  - The generated `package.json` adds plain-Playwright scripts: `test:e2e`, `test:e2e:ui`
    (`tests/ui`), `test:e2e:api` (`tests/api`), `test:e2e:parallel` (`--workers=2`), `test:e2e:headed`.
  - New offline UI sample `tests/ui/todo.spec.ts` — a small interactive todo list rendered via
    `page.setContent`, using `getByLabel`/`getByRole` and web-first assertions. Independent and
    parallel-safe (no shared mutable state).
  - Generated README documents the run modes and that parallelism is Playwright's, not TestPilot's.

  Playwright remains the runner — no custom parallel runner, sharding, or browser-matrix expansion.
  `testpilot run` already forwards Playwright flags (e.g. `run -- --workers=2`) verbatim.
