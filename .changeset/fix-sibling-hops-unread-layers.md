---
'@testpilot/locator-intelligence': patch
'@testpilot/core': patch
'testpilot-qa': patch
---

Two more places `prefer-get-by-test-id` made a claim it could not support, and one place
`prefer-semantic-locator` gave advice a call site had already taken.

**A sibling step on a later `>>` part was called an ancestor.**
`locator('[data-testid="a"] >> + div')` reported *"the test id is on an ancestor of the element this
selector targets"* — but Playwright parses that second part as `:scope + div`, so the target is the
test id's **adjacent sibling**. The within-part spelling `'[data-testid="a"] + div'` has abstained
since the rule learned about combinators; the `>>` spelling had not, so one locator written two ways
gave two answers. Also `>> ~ div` and mid-chain `>> + div >> span`.

**Playwright's default was asserted over a config layer the same run said it could not read.**
`defineConfig(base, { testDir })` with an imported `base` reported
`playwrightTestIdAttribute: null` — "the config sets none, so `data-testid` applies" — beside its own
`playwright-config-partial` warning saying a layer was unreadable. The `PROSE_MARKERS` set that
`declaresTags` already widens on is now consulted here too, so an unread layer, extra `defineConfig()`
arguments, and a computed key in `use` all yield `"unresolved"`.

**`prefer-semantic-locator` told ten corpus call sites to "add a `data-testid`" they already have** —
including the nine `[data-viewer-content] [data-testid="ocr-box"]` sites the previous release moved
to this rule. It now says something different when the selector already carries a test id.

Also corrected: the `uninspected-call-sites` warning enumerated "an interpolated template literal, a
variable, or an `as string`" — measured over the 317 corpus cases, `as string` occurs **zero** times
while `locator('text=' + name)` and `locator(selector.selector)` do. It no longer publishes a closed
list. And `prefer-semantic-locator` now honours the same "options bag we could not read" signal its
sibling does.

Corpus findings are unchanged; all three rule fixes have zero corpus incidence, and the ten reworded
suggestions are text.
