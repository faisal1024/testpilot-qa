---
"testpilot-qa": minor
"@testpilot/core": minor
"@testpilot/locator-intelligence": minor
---

Milestone 3A — Locator Intelligence foundation.

- **`@testpilot/locator-intelligence`** graduates from a stub to the static-analysis engine:
  an AST parser (`@typescript-eslint/parser`), a locator extractor producing a `LocatorContext`
  per call-site, a pure-function rule engine, file resolution (config `include`/`testDir` or
  explicit globs), and an `analyze()` orchestrator that emits a stable, deterministic
  `AnalysisReport`. Two reference rules ship to exercise the pipeline (`no-xpath`,
  `no-css-class-selector`); the remaining locator rules land in 3B by adding registry entries.
- **`@testpilot/core`** gains the shared analysis contract (`Finding`, `AnalysisReport`,
  `FindingSeverity`, `RuleCategory`).
- **`testpilot analyze [patterns...]`** is now real: it parses configured test files and emits
  findings + summary, as a human table or stable `--json`. Severity is config-driven (`off`
  disables a rule). Reporting-only for now — score gating arrives with the scoring model.

No DOM-aware suggestions, AI, auto-fix, MCP, SARIF/HTML reports, or public plugin API.
