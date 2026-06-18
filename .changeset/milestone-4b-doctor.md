---
"testpilot-qa": minor
"@testpilot/core": minor
---

Milestone 4B — `testpilot doctor`.

- `testpilot doctor` diagnoses project readiness and common setup issues: Node.js version,
  `package.json` presence, local Playwright install, Playwright config discovery,
  `testpilot.config.ts` validity, test-directory existence, include-pattern sanity, and TestPilot
  project structure. AI guidance-file drift is reported as "not checked yet" (the generator lands
  later — no faked drift).
- Human report (overall pass/warn/fail + per-check id/title/category/status/message/remediation +
  deduped next actions) and stable `--json` (`schemaVersion` `1.0`). Respects `--cwd`/`--config`/
  `--json`/`--quiet`.
- CI-friendly exit codes: `0` (no hard problems; warnings allowed), `3` (invalid config — takes
  precedence), `4` (environment/project setup problems), `5` (unexpected internal error).
- Diagnosis logic lives in `@testpilot/core` (`runDoctor`) so future GitHub Actions, agents, and a
  programmatic API can reuse it; the CLI handler stays thin.

With this, all five MVP commands are implemented. Removed the now-dead `not-implemented` placeholder
helper and its exit code. No network calls, no LLM, no auto-fix, no DOM-aware analysis.
