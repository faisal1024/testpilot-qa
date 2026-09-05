# @testpilot/locator-intelligence

## 0.1.0-alpha.0

### Minor Changes

- 7e899d9: Milestone 3A — Locator Intelligence foundation.

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

- 7086318: Milestone 3B — complete the MVP Tier 1 rule set and enrich analyze output.

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

- cb13c67: Milestone 3C — Locator Quality Score and CI gating.

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

- 41a16cb: Milestone 4A — `testpilot explain <ruleId>` rule education.

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

### Patch Changes

- Updated dependencies [1afb2a5]
- Updated dependencies [0c4951a]
- Updated dependencies [7e899d9]
- Updated dependencies [7086318]
- Updated dependencies [cb13c67]
- Updated dependencies [41a16cb]
- Updated dependencies [f311fff]
- Updated dependencies [e1fb936]
- Updated dependencies [960e717]
- Updated dependencies [558a498]
  - @testpilot/core@0.1.0-alpha.0
