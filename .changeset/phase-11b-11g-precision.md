---
'@testpilot/locator-intelligence': minor
'@testpilot/reporters': minor
'@testpilot/core': minor
'testpilot-qa': minor
---

Phase 11b + 11g — the noisiest rule splits, and the report says what it could not read.

**`prefer-user-facing-locator` is replaced by two rules.** It was 65% of every finding TestPilot
reported on a five-repo corpus, at `warn`, whether the selector was `[data-testid="save"]` (a
mechanical rewrite) or `#login-form div.actions > button` (a judgement call).

- **`prefer-get-by-test-id`** (`warn`) — a test id addressed through a raw CSS attribute selector.
  It names the exact replacement (`getByTestId('save')`), or asks for a scope when the test id is
  on an ancestor rather than the target. The attribute list defaults to `data-testid`,
  `data-test-id`, `data-test` and is configurable:
  `ruleOptions: { 'prefer-get-by-test-id': { testIdAttributes: ['data-qa'] } }`.
- **`prefer-semantic-locator`** (`info`) — a selector with no role, label or ARIA handle. It stays
  quiet on `[role=]` and `[aria-*]`, on `has`/`hasText` composition in either spelling, on a
  `locator()` narrowing a `getBy*()` parent, and on test ids.

**A config or baseline written against the old id keeps working**: `prefer-user-facing-locator`
maps to both successors and carries its severity to them, with a `deprecated-rule-id` warning. It
is no longer also reported as an unknown rule — the report used to say "unknown — ignored" and
"taking its setting" about the same line.

Measured on the corpus: **1973 findings became 1829**, and every one of the 144 removals is
attributed — 84 composed with a `has`/`hasText` option, 27 carrying `role=`/`aria-*`, 21 chained
off a `getBy*()` parent, 12 composed with `:has()`/`:has-text()`, 0 unreadable. Scores rise
(cal.com 74→82, immich 91→96, documenso 91→94, mattermost 67→75, Ghost unchanged) from re-grading
1326 findings `warn`→`info` plus those removals; `callSites` is identical on all five repos.

**Uninspectable call sites are now counted and disclosed (11g).** A selector built with `${}`, held
in a variable, or written in syntax the parser declines to guess at is a call site no rule can read
— and it still counts toward the score's denominator.

- `summary.uninspectedCallSites` counts them.
- A run where they exceed 10% of call sites emits an `uninspected-call-sites` warning.
- When **every** call site is uninspectable, `score.score` and `score.grade` are `null`, printed as
  "not enough evidence" — never `100 (A)` over locators nobody read. `--min-score` fails on a
  `null` score.

Analysis schema **1.11**: `summary.uninspectedCallSites` added; `QualityScore.score` and
`.grade` are now `number | null` / `Grade | null`. Consumers that read the score must handle
`null`; it occurs only when there is at least one call site and not one of them could be read.
