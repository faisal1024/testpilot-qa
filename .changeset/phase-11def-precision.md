---
"testpilot-qa": minor
"@testpilot/core": minor
"@testpilot/locator-intelligence": minor
---

Three rules get more precise, and two over-graded findings are re-levelled.

- **`no-deep-css-chain` measures depth per selector**, from the tokenizer. A comma is not a
  combinator: `strong em, em strong` is two one-step selectors, and the old string-mangling scored it
  3. Depth inside `:has()` counts; a `>>` chain does not add across parts. The threshold is now
  configurable — `ruleOptions: { 'no-deep-css-chain': { maxChainDepth: 4 } }` — and the finding says
  how deep the selector actually is.
- **`avoid-positional-access` (new, `warn`)** takes `.nth()` out of `no-nth-child`. Picking one of an
  intentionally repeated element is idiomatic Playwright and appears throughout its own docs; grading
  it identically to a CSS `:nth-child()` selector made a third of that rule's findings unactionable.
  `no-nth-child` keeps `:nth-child()` at `error` and, reading the tokenizer, no longer fires on the
  pseudo's name inside an attribute *value*.
- **`avoid-parent-traversal` (new, `info`)** takes `locator('..')` out of `no-xpath`. It is a
  recognised Playwright idiom rather than a hand-written path expression — and on the corpus it was
  **6 of 8** xpath findings, so the `error`-level rule was mostly reporting the quiet case and the
  real XPath did not stand out.
- Both new rules ship with a **"Does not fire on"** list that the test suite executes.

**On the score.** It rises: cal.com 69→74, immich 89→91, Ghost 98→99, documenso 89→91,
mattermost 66→67. That is entirely the two re-gradings — cal.com is exactly 113 findings × 3 weight
points ÷ (1326 × 5) = 5.1%. **`callSites` is unchanged on all five repos**, which is how you can tell
the rise is not the denominator moving.

`.first()`/`.last()` are **not** extracted yet, against the plan's wording for 11e. They would become
call sites — the score's denominator — and measured that moves every score 3–8 points, enough to flip
a `--min-score 70` gate. A precision release must not move the score sideways while claiming to be
about false positives, so they land with Phase 12, which owns the denominator. The rule is ready.

Also folds in two follow-ups to the tokenizer: `:nth-child(2 of.foo)` with no space after `of` is
valid CSS that Playwright accepts and was silently dropping its selector, and the differential CI
step now runs after the corpus exists rather than before it.
