---
"testpilot-qa": minor
"@testpilot/core": minor
---

Milestone 6A — brownfield baseline & report output for `analyze`.

- **`--output <path>`** writes the full JSON report to a file (creating parent directories) instead
  of stdout, confirming with `Report written to <path>.`.
- **`--baseline <path>`** compares the current findings to a saved baseline and gates on *new*
  findings only — exit **1** when a regression appears, exit **0** when every current finding is
  grandfathered in. A finding's baseline identity is `ruleId + file + snippet`
  (line/column/severity-independent), so moving code or re-grading a rule never resurfaces an accepted
  finding; duplicate occurrences are counted, so an extra duplicate beyond the baseline count is new.
- **`--update-baseline`** (requires `--baseline`) records the current findings to that path and exits
  **0** without gating.
- When `--baseline` is active, the JSON report gains a `baseline` block
  (`{ path, newFindings, baselinedFindings }`); `ANALYSIS_SCHEMA_VERSION` bumps to **1.3**.
- Missing/malformed baseline files and unwritable `--output`/`--baseline` paths exit **2** (usage)
  with a clear message.
- **`@testpilot/core`** adds the pure baseline module (`buildBaseline`, `compareToBaseline`,
  `findingKey`, and the `Baseline`/`BaselineEntry`/`BaselineComparison`/`BaselineReport` types).

Still Tier 1 / static — no DOM, no network, no LLM. README and CLI spec updated; smoke:mvp covers the
new flags end to end.
