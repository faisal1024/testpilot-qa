---
"testpilot-qa": minor
"@testpilot/ai": minor
"@testpilot/core": minor
---

Milestone 5B — `doctor` AI guidance drift detection (detection only).

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
