# @testpilot/scaffold

## 0.1.0-alpha.2

### Patch Changes

- @testpilot/templates@0.1.0-alpha.2

## 0.1.0-alpha.1

### Patch Changes

- @testpilot/templates@0.1.0-alpha.1

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

- e1fb936: Milestone 5A — AI agent guidance generation.

  - `@testpilot/ai` defines the TestPilot + Playwright guidance **once** (`CANONICAL_GUIDANCE`) and
    deterministically generates four agent files from it: `CLAUDE.md`, `AGENTS.md`,
    `.github/copilot-instructions.md`, and `.cursor/rules/testpilot-playwright.mdc`. Offline, no LLM.
  - Each file carries a generated marker with a version + content hash (`@testpilot/guidance v1
sha256:…`). Exported helpers (`parseGuidanceMarker`, `extractGeneratedBody`, `isGuidancePristine`)
    set up Milestone 5B's `doctor` drift detection.
  - `testpilot init` now scaffolds these files by default. They flow through the existing
    overwrite-protection path: missing files are created, existing files are skipped (reported in
    human and JSON output), and `--force` overwrites — consistent with the rest of the scaffold.
  - Config: `ai.agents` now defaults to all supported agents (`claude`, `codex`, `cursor`, `copilot`);
    `scaffoldProject` accepts an `agents` option.

  Guidance is honest about Tier 1 limits — no DOM-aware suggestions, no auto-fix, no AI-generated
  tests, no LLM calls. Playwright remains the runner.

### Patch Changes

- Updated dependencies [1afb2a5]
- Updated dependencies [33cf0fa]
- Updated dependencies [e1fb936]
- Updated dependencies [960e717]
  - @testpilot/templates@0.1.0-alpha.0
  - @testpilot/ai@0.1.0-alpha.0
