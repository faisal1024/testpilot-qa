---
"testpilot-qa": minor
"@testpilot/core": minor
"@testpilot/locator-intelligence": minor
---

Milestone 3B — complete the MVP Tier 1 rule set and enrich analyze output.

- Add four rules to `@testpilot/locator-intelligence`: `no-nth-child` (CSS `:nth-child()` and
  `.nth()` chains), `no-deep-css-chain` (conservative combinator-depth heuristic),
  `prefer-user-facing-locator` (raw css/text `locator()` → category guidance), and `no-hard-wait`
  (`waitForTimeout`, a flakiness rule). The MVP Tier 1 set is now all six rules.
- Extend the extractor to recognize `.nth()` and `waitForTimeout` call-sites and to point finding
  locations at the method name (precise in chains). Non-string literal args (e.g. `.nth(2)`) are
  treated as static, not dynamic.
- Enrich the analysis report (`schemaVersion` `1.1`): unknown rule ids in config now surface as
  `warnings`, and unparseable files are reported in `parseErrors` (with a `filesWithParseErrors`
  count) instead of failing the command.
- Every rule honors config severity overrides and `off`. Rules give category-level guidance only.

Still Tier 1 / reporting-only: no DOM suggestions, AI, auto-fix, MCP, SARIF/HTML, plugin API, or
scoring. `analyze` exits 0; `--min-score` gating is Milestone 3C.
