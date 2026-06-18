---
"testpilot-qa": minor
"@testpilot/core": minor
"@testpilot/locator-intelligence": minor
---

Milestone 4A — `testpilot explain <ruleId>` rule education.

- `testpilot explain <ruleId>` is now real for all six MVP Tier 1 rules. Human output shows the id,
  default severity, category, title, summary, why it matters, a ✗ bad example, a ✓ better example,
  guidance, and a docs URL; `--json` emits the same fields as a stable object. An unknown rule id
  prints a clear error listing the available rules and exits 2.
- Structured `RuleExplanation` metadata lives in `@testpilot/locator-intelligence`
  (`ruleExplanations` / `getExplanation` / `explanationIds`), with id/category/severity/docsUrl
  sourced from each rule so they cannot drift. The `RuleExplanation` type is in `@testpilot/core`.
- CLI stays thin: the command looks up data and renders it; no rule content is hardcoded in the CLI.

Tier 1 / static: examples are self-contained illustrations and never claim knowledge of the user's
DOM. No auto-fix, no DOM-derived replacements, no AI.
