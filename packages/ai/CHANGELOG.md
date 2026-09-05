# @testpilot/ai

## 0.1.0-alpha.0

### Minor Changes

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

- 960e717: Milestone 5B — `doctor` AI guidance drift detection (detection only).

  - `@testpilot/ai` adds pure, deterministic `classifyGuidanceFile(agent, content)` →
    `current` / `missing` / `edited` / `stale` / `no-marker`, plus `selectedAgents()`.
  - `testpilot doctor`'s `ai-guidance` check is now real: for the agents selected by
    `config.ai.agents` (default: all four), it reads each expected file and reports drift, with a
    per-file structured breakdown in `check.details.files` (agent, path, state, reason, expected vs.
    marker version/hash). Replaces the previous "not checked yet" stub.
  - Drift is a **warning, never a hard failure** — it never changes the exit code by itself. The check
    is read-only and never regenerates or overwrites anything.
  - `DoctorCheck` gains an optional `details` field (backwards-compatible; existing JSON unchanged).

  Respects `--cwd`/`--config`; invalid config still exits 3. Regeneration (`testpilot add ai`) remains
  out of scope. No LLM, auto-fix, DOM analysis, or network.
