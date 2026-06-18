---
"testpilot-qa": minor
"@testpilot/core": minor
"@testpilot/locator-intelligence": minor
---

Milestone 3C — Locator Quality Score and CI gating.

- Add a deterministic, static **Locator Quality Score** (0–100) with letter grades (A ≥90, B ≥80,
  C ≥70, D ≥60, F <60) and four sub-scores: Resilience (locator rules), Flakiness (flakiness rules),
  Accessibility and Maintainability (100 until such rules exist). Model: `penalty = Σ severity weight`,
  `maxPenalty = call-sites × error weight`, `score = clamp(round(100 × (1 − penalty/maxPenalty)), 0, 100)`,
  using `config.scoring.weights`. Zero call-sites → 100/A. The score is included in human and JSON
  output (`schemaVersion` → `1.2`, new top-level `score`).
- Add **`testpilot analyze --min-score <n>`**: exits non-zero (1) with a clear message when the score
  is below the threshold; exits 0 otherwise. Precedence: `--min-score` flag → `config.scoring.minScore`
  → no gating. `config.scoring.minScore` is now optional (no default) so analyze does not gate unless asked.
- Parse errors are reported but do not affect the score in this milestone.

Scoring logic lives in `@testpilot/locator-intelligence` (`computeScore`/`gradeFor`); the CLI stays
thin. Still Tier 1 / static — no DOM, AI, auto-fix, SARIF/HTML, baseline, `--changed`, or plugin API.
No new rules added.
