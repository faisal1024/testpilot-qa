---
"testpilot-qa": minor
"@testpilot/ai": minor
"@testpilot/scaffold": minor
"@testpilot/core": minor
---

Milestone 5A — AI agent guidance generation.

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
