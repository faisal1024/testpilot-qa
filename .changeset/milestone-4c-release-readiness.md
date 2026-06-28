---
"testpilot-qa": patch
---

Milestone 4C — MVP release-readiness polish.

- Consistency fix: `testpilot analyze` now prints its human report to **stdout** (matching
  `doctor`/`explain`/`init`); it previously went to stderr. `--json` and `--quiet` behavior unchanged.
- Added a fast, offline `pnpm smoke:mvp` script (`scripts/smoke-mvp.mjs`) covering help/version,
  `explain --json`, `doctor --json`, `analyze` on a temp spec, and `init` scaffolding (expected
  files, generated parallel/sample scripts, plain-Playwright README note, and overwrite protection).
- Docs brought current: README (MVP complete + Development/release section), CLI-Spec status,
  Roadmap (Phases 1–4 marked delivered), GitHub-Issues (MVP P0 epics delivered), and a new
  `docs/Release-Checklist.md` (release gate + dependency-PR triage notes).

No feature expansion: no auto-fix, DOM-aware analysis, AI, HTML/SARIF, MCP, or dashboards.
Playwright remains the runner.
