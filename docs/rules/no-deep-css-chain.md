# `no-deep-css-chain` — Avoid deep CSS selector chains

<!-- Generated from packages/locator-intelligence/src/explanations.ts by `pnpm docs:rules`. Do not edit by hand. -->

> **Category:** locator · **Default severity:** warn

Long descendant/child chains encode the DOM hierarchy and break on structural changes.

## Why it matters

A chain like "header nav ul li a" hard-codes an entire ancestry. Any intermediate change — a new wrapper, a layout refactor — breaks it, and the deeper the chain the more brittle the locator becomes.

## Example

**Avoid**

```ts
await page.locator('header nav ul li a').click()
```

**Prefer**

```ts
await page.getByRole('link', { name: 'Docs' }).click()
```

## Guidance

- Prefer a single user-facing locator over a structural path.
- Use locator chaining (locator.getByRole(...)) only to scope, not to encode DOM depth.
- Depth is counted per selector, so a comma-separated list of shallow selectors is not a deep chain.
- The threshold defaults to 3 and is configurable: `ruleOptions: { 'no-deep-css-chain': { maxChainDepth: 4 } }` (1-20).

## Does not fire on

```ts
page.locator('strong em, em strong')  // two one-step selectors, not a three-step chain
page.locator('[title="a b c d"]')     // whitespace inside a value is not a combinator
```

## In the CLI

- `testpilot explain no-deep-css-chain` prints this page in the terminal.
- Disable or re-level it in `testpilot.config.ts`: `rules: { 'no-deep-css-chain': 'off' | 'info' | 'warn' | 'error' }`.
- Adopting on an existing suite? Record a baseline (`testpilot analyze --baseline testpilot-baseline.json --update-baseline`) and gate on new findings only.

[← All rules](README.md)
