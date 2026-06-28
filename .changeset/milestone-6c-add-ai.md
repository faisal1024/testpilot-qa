---
"testpilot-qa": minor
---

Milestone 6C — `testpilot add ai [agent]`: safe AI guidance regeneration.

Regenerate the AI agent guidance files (`CLAUDE.md`, `AGENTS.md`, Cursor, Copilot) **without** running
the full scaffold. Touches only guidance files — never your tests or scaffold — and calls no LLM.

- **Dry-run by default**: previews per-file actions and writes nothing. `--write` applies
  create/update; `--force` implies `--write` and additionally overwrites files edited after generation.
- Reuses `doctor`'s drift classification: **missing → create**, **stale (older guidance version) →
  update**, **current → unchanged**, **hand-edited / unmarked → kept** (only overwritten with
  `--force`). User edits are never clobbered by default.
- `[agent]` is a single id (`claude`/`codex`/`cursor`/`copilot`) or `all`; omitted, it uses
  `config.ai.agents`. An unknown agent exits **2**.
- `--json` emits a stable report `{ command:'add', resource:'ai', dryRun, files[], summary }`; `--quiet`
  prints nothing.

New pure helpers in `@testpilot/ai` (`resolveGuidanceAction`, `actionWrites`) keep the decision logic
testable and shared. README, CLI-Spec, AI-Agent-Integration, and Adoption-Plan updated; `smoke:mvp`
covers create → idempotent re-write end to end.
