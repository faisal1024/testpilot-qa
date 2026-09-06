---
'@testpilot/locator-intelligence': patch
'@testpilot/core': patch
'testpilot-qa': patch
---

Two more places `prefer-get-by-test-id` made a claim it could not support, and one place
`prefer-semantic-locator` gave advice a call site had already taken.

**`prefer-get-by-test-id` now recognises a closed set of shapes it can prove, instead of enumerating
the ways a selector can escape.**
`locator('[data-testid="a"] >> + div')` reported *"the test id is on an ancestor of the element this
selector targets"* — but Playwright parses that second part as `:scope + div`, so the target is the
test id's **adjacent sibling**. The within-part spelling `'[data-testid="a"] + div'` has abstained
since the rule learned about combinators; the `>>` spelling had not, so one locator written two ways
gave two answers. Fixing that spelling surfaced the next: `>> *:scope + div` and
`>> :scope:hover + div`, which Playwright parses identically to `>> + div`. Fixing *those* surfaced
`>> :is(:scope) + div` — `:is(:scope)` is `:scope` to Playwright's own engine. Three rounds, three
spellings, each found inside the fix for the last.

So the rule stopped enumerating escapes. It now names a rewrite only for shapes it can prove: **one**
selector, no `>>` chaining, the test id leading it, reaching the target through descendant or `>`
steps. Everything else is silent. The set of ways to leave a subtree is open — CSS and Playwright
keep adding spellings — while the set of shapes that provably stay is small and closed.

`locator('[data-testid=a] >> div')` loses its finding to this, which is real advice given up. It
occurs **zero** times across the five corpus repos, and the corpus counts are unchanged.

**Playwright's default was asserted over a config layer the same run said it could not read.**
`defineConfig(base, { testDir })` with an imported `base` reported
`playwrightTestIdAttribute: null` — "the config sets none, so `data-testid` applies" — beside its own
`playwright-config-partial` warning saying a layer was unreadable. The `PROSE_MARKERS` set that
`declaresTags` already widens on is now consulted here too, so an unread layer, extra `defineConfig()`
arguments, a computed key in `use`, **and a computed key one level up — where it could be `use`
itself** — all yield `"unresolved"`. `hasSpread` was already checked at both levels; the
computed-key check was not, four lines apart in the same function.

`testIdAttributeIn` also goes back to the **narrow** config lookup, the one `declaresTagsIn` and
`testpilot run` use. The previous release switched it to the descend-a-level lookup, but this helper
only runs on the branches where a sub-directory config was *not* adopted — and there
`examples/playwright.config.ts` governs its own tests, not yours. Finding nothing at the root while
something exists one level down is now `"unresolved"` rather than `null`: unknown, not "the default
applies".

**`prefer-semantic-locator` told ten corpus call sites to "add a `data-testid`" they already have** —
including the nine `[data-viewer-content] [data-testid="ocr-box"]` sites the previous release moved
to this rule. It now says something different when the selector already carries a test id.

Also corrected: the `uninspected-call-sites` warning enumerated "an interpolated template literal, a
variable, or an `as string`". Measured over the 317 corpus cases by AST node type: **195**
interpolated templates, **120** variables, **1** property access, **1** concatenation, and **zero**
`as string`. It no longer publishes a closed list — nor does `docs/Scoring.md`, `docs/CLI-Spec.md`,
or the predicate's own doc comment, two of which still carried it after the first pass. And `prefer-semantic-locator` now honours the same "options bag we could not read" signal its
sibling does.

Corpus findings are unchanged; all three rule fixes have zero corpus incidence, and the ten reworded
suggestions are text.
