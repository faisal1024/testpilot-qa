# `no-css-class-selector` — Avoid CSS class selectors

<!-- Generated from packages/locator-intelligence/src/explanations.ts by `pnpm docs:rules`. Do not edit by hand. -->

> **Category:** locator · **Default severity:** error

Class names exist for styling and change often, so class-based locators are brittle.

## Why it matters

CSS classes are owned by your styling layer (design systems, CSS modules, utility frameworks). They get renamed, hashed, or removed during refactors with no intent to change behavior, so class-based locators break for reasons unrelated to the feature under test.

## Example

**Avoid**

```ts
await page.locator('.btn-primary').click()
```

**Prefer**

```ts
await page.getByRole('button', { name: 'Save' }).click()
```

## Guidance

- Prefer role/label/text locators that reflect what the user sees.
- If there is no semantic handle, add a stable data-testid and use getByTestId().
- A class nested in `:has()`, `:not()` or `:is()` counts — the test depends on it either way.

## Does not fire on

```ts
page.locator('[href=".pdf"]')      // a dot inside a quoted attribute value is not a class
page.locator('#main')              // an id is a different trade-off, not this rule's business
page.locator('text=Save file.txt') // not a CSS selector at all
page.locator('button:has-text("a.b")') // :has-text() takes text, not a selector
```

## In the CLI

- `testpilot explain no-css-class-selector` prints this page in the terminal.
- Disable or re-level it in `testpilot.config.ts`: `rules: { 'no-css-class-selector': 'off' | 'info' | 'warn' | 'error' }`.
- Adopting on an existing suite? Record a baseline (`testpilot analyze --baseline testpilot-baseline.json --update-baseline`) and gate on new findings only.

[← All rules](README.md)
