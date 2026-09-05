# TestPilot QA rules

<!-- Generated from packages/locator-intelligence/src/explanations.ts by `pnpm docs:rules`. Do not edit by hand. -->

Every rule `testpilot analyze` can report, with why it matters and what to write instead. All
rules are static (Tier 1): they read your test source and never touch a browser or the DOM.

| Rule | Category | Default | Summary |
|---|---|---|---|
| [`no-css-class-selector`](no-css-class-selector.md) | locator | error | Class names exist for styling and change often, so class-based locators are brittle. |
| [`no-deep-css-chain`](no-deep-css-chain.md) | locator | warn | Long descendant/child chains encode the DOM hierarchy and break on structural changes. |
| [`no-hard-wait`](no-hard-wait.md) | flakiness | error | Fixed waitForTimeout() sleeps make tests slow and flaky. |
| [`no-nth-child`](no-nth-child.md) | locator | error | Selecting by position (:nth-child or .nth()) depends on sibling order and breaks when items move. |
| [`no-xpath`](no-xpath.md) | locator | error | XPath selectors couple tests to the DOM tree and break when structure changes. |
| [`prefer-user-facing-locator`](prefer-user-facing-locator.md) | locator | warn | Raw CSS/text locator() strings are less resilient than Playwright user-facing locators. |

How findings turn into the 0–100 Locator Quality Score is documented in [Scoring.md](../Scoring.md).
