# `no-xpath` — Avoid XPath selectors

<!-- Generated from packages/locator-intelligence/src/explanations.ts by `pnpm docs:rules`. Do not edit by hand. -->

> **Category:** locator · **Default severity:** error

XPath selectors couple tests to the DOM tree and break when structure changes.

## Why it matters

XPath targets elements by their position in the document tree, so any markup refactor — a new wrapper element or reordered nodes — silently breaks the locator. User-facing locators target what a user (and assistive technology) perceives, which is far more stable.

## Example

**Avoid**

```ts
await page.locator('//button[@type="submit"]').click()
```

**Prefer**

```ts
await page.getByRole('button', { name: 'Submit' }).click()
```

## Guidance

- Prefer getByRole / getByLabel / getByText / getByTestId.
- Reach for XPath only for the rare case CSS and user-facing locators genuinely cannot express.

## Does not fire on

```ts
page.locator('..')                  // parent traversal — see avoid-parent-traversal
page.locator('[href="//cdn.x"]')    // a slash inside a quoted attribute value
page.getByRole('button')            // not a selector string at all
```

## In the CLI

- `testpilot explain no-xpath` prints this page in the terminal.
- Disable or re-level it in `testpilot.config.ts`: `rules: { 'no-xpath': 'off' | 'info' | 'warn' | 'error' }`.
- Adopting on an existing suite? Record a baseline (`testpilot analyze --baseline testpilot-baseline.json --update-baseline`) and gate on new findings only.

[← All rules](README.md)
