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
  **9 of the 11** xpath findings, so the `error`-level rule was mostly reporting the quiet case and the
  real XPath did not stand out.
- Both new rules ship with a **"Does not fire on"** list that the test suite executes.

**On the score.** It rises: cal.com 69→74, immich 89→91, Ghost 98→99, documenso 89→91,
mattermost 66→67. That is entirely the two re-gradings — cal.com is 113 findings × 3 weight points plus one
xpath finding × 4.5, over 1326 × 5 — 5.18%. **`callSites` is unchanged on all five repos**, which is how you can tell
the rise is not the denominator moving.

`.first()`/`.last()` are **not** extracted yet, against the plan's wording for 11e. They would become
call sites — the score's denominator. Measured by adding them to `LOCATOR_METHODS` and re-running the
corpus:

| repo | callSites | score |
|---|---|---|
| cal.com | 1326 → 1431 (+7.9%) | 74 → 73 |
| immich | 352 → 366 (+4.0%) | 91 → 90 |
| Ghost | 95 → 143 (**+50.5%**) | 99 → **86** |
| documenso | 3774 → 4054 (+7.4%) | 91 → 89 |
| mattermost | 2954 → 3202 (+8.4%) | 67 → 66 |

Ghost loses 13 points because half its locator calls are positional. The reason to hold it back is
not the size of the move but that it is a **second, unrelated mechanism** acting on the same number:
a severity re-grade and a denominator change are different claims about a suite, and shipping both at
once makes neither checkable. `callSites` is byte-identical on all five repos here precisely so a
reader can attribute this release's movement entirely to the re-grading. The denominator is Phase
12's subject; the rule already handles the two calls.

**If you gate on `--min-score`, re-check your threshold on this release.** A gate that was passing
still passes; one you had tuned tightly is now looser than you meant.

Two rules — `no-deep-css-chain` and `no-nth-child` — now fire on **none** of the five corpus repos,
so they are covered by unit tests alone. That is recorded in the baseline rather than left for a
reader to notice.

Also folds in two follow-ups to the tokenizer: `:nth-child(2 of.foo)` with no space after `of` is
valid CSS that Playwright accepts and was silently dropping its selector, and the differential CI
step now runs after the corpus exists rather than before it.

**Existing configs and `--baseline` files keep working; SARIF suppressions do not.** GitHub code
scanning keys an alert on `ruleId` plus location, and the successor map is a TestPilot-side concept,
so findings that changed id will surface as closed-and-reopened alerts on the first run after
upgrading. There is no way to avoid that from here — flagged because it is the one place the
compatibility work does not reach.

**Existing configs and baselines keep working.** A rule split changes finding ids, which would
otherwise re-report every grandfathered finding as new (measured: 114 on cal.com, on a suite where
nothing changed) and un-silence a rule someone had set to `off`. Both are handled by a successor map:
a `--baseline` entry recorded under a rule's previous id still matches, and both the table and
`--json` report how many did, so the absorption is visible rather than silent, and a severity set on the old id carries to its successors with a
`deprecated-rule-id` warning naming the replacement. `GUIDANCE_VERSION` 4 → 5, since the AI guidance
told agents to "never use `.nth()`" and the analyzer no longer agrees.
