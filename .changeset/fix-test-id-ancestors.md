---
'@testpilot/locator-intelligence': patch
'@testpilot/core': patch
'testpilot-qa': patch
---

`prefer-get-by-test-id` stops naming rewrites that select a different element, and learns what
`getByTestId()` actually queries.

**An ancestor before the test id was silently dropped**, on both the "use it directly" and the
"scope with it" paths. `locator('#login-modal [data-testid="save"]')`
was answered *"Use `getByTestId('save')` instead"* — which searches the whole document. The identical
locator written `'#login-modal >> [data-testid="save"]'` correctly abstained, so the two spellings of
one selector gave opposite answers. A leading combinator (`'> [data-testid=x]'`) and a same-compound
ancestor (`'.modal button[data-testid=x]'`, whose message claimed the conditions were on the *same
element*) had the same hole. **All nine of immich's findings in the corpus benchmark were this**;
they are now `prefer-semantic-locator` `info` rather than a wrong `warn`.

**`getByTestId()` queries exactly one attribute** — `use.testIdAttribute` from your Playwright
config, which defaults to `data-testid`. Suggesting it for `[data-test="x"]` or `[data-test-id="x"]`
on a stock config named a locator that selects nothing. TestPilot now **reads `use.testIdAttribute`**
(config and `projects[]`, resolving each project against the config it inherits from, and treating a
spread, an unreadable value, or projects that disagree as unknown) and qualifies the
suggestion when the selector's attribute is not the one Playwright will query. New report field:
`discovery.playwrightTestIdAttribute`.

**An unreadable options bag read as no options.** `locator('[data-testid=row]', OPTS)`,
`{ ...OPTS }` and `{ [KEY]: 'x' }` all got the confident rewrite, because "passed but unreadable"
and "not passed" both arrived as `undefined`. They are now distinguished, and the rule abstains on
both. (A chained `.filter({ hasText })` still reports — it survives the rewrite.)

**Escapes in quoted attribute values are resolved.** `[data-testid="\41 bc"]` read as the value
`41 bc` while the identical unquoted `[data-testid=\41 bc]` read as `Abc`; both are `Abc` per CSS.
The quoted reader copied the character after the backslash while its own doc comment said it
resolved escapes.

Corpus totals are unchanged (1973 → 1676 findings); the split moves — `prefer-get-by-test-id`
511 → 502, `prefer-semantic-locator` 1165 → 1174. One published count is also corrected: the
`has`/`hasText` row of the Phase 11b attribution is **253**, not 252.
