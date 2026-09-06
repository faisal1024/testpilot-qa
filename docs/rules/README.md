# TestPilot QA rules

<!-- Generated from packages/locator-intelligence/src/explanations.ts by `pnpm docs:rules`. Do not edit by hand. -->

Every rule `testpilot analyze` can report, with why it matters and what to write instead. All
rules are static (Tier 1): they read your test source and never touch a browser or the DOM.

| Rule | Category | Default | Summary |
|---|---|---|---|
| [`avoid-parent-traversal`](avoid-parent-traversal.md) | locator | info | locator('..') walks up to the parent element, so the test depends on how the DOM is nested. |
| [`avoid-positional-access`](avoid-positional-access.md) | locator | warn | Selecting by position depends on how many elements match and in what order. Detects `.nth()` today; `.first()`/`.last()` arrive with Phase 12. |
| [`no-css-class-selector`](no-css-class-selector.md) | locator | error | Class names exist for styling and change often, so class-based locators are brittle. |
| [`no-deep-css-chain`](no-deep-css-chain.md) | locator | warn | Long descendant/child chains encode the DOM hierarchy and break on structural changes. |
| [`no-hard-wait`](no-hard-wait.md) | flakiness | error | Fixed waitForTimeout() sleeps make tests slow and flaky. |
| [`no-nth-child`](no-nth-child.md) | locator | error | Selecting by position (:nth-child or .nth()) depends on sibling order and breaks when items move. |
| [`no-xpath`](no-xpath.md) | locator | error | XPath selectors couple tests to the DOM tree and break when structure changes. |
| [`prefer-user-facing-locator`](prefer-user-facing-locator.md) | locator | warn | Raw CSS/text locator() strings are less resilient than Playwright user-facing locators. |
| [`require-test-tag`](require-test-tag.md) | maintainability | off (`info` when enabled) | A test with no tag cannot be selected by any tag-based run, so it silently misses every suite. |

How findings turn into the 0–100 Locator Quality Score is documented in [Scoring.md](../Scoring.md).
