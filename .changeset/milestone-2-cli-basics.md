---
"testpilot-qa": minor
"@testpilot/core": minor
---

Milestone 2 — CLI Basics: add the global option surface (`--json`, `--config`, `--cwd`, `--yes`,
`--quiet`, `--verbose`, `--no-color`) and `testpilot.config.ts` loading with upward discovery,
zod validation, and sensible defaults. Project-oriented commands (`analyze`, `doctor`) now resolve
config before their placeholder output. No feature logic yet.

`testpilot-qa` now exposes a side-effect-free library entry (`main`/`exports`) that re-exports
`defineConfig` and the config types, separate from the CLI `bin`, so a generated
`testpilot.config.ts` can `import { defineConfig } from 'testpilot-qa'`. Invalid `--cwd`
directories now fail with a clear `ConfigError` (exit 3) instead of silently using defaults.
