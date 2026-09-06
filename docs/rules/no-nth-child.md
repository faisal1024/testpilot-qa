# `no-nth-child` — Avoid :nth-child() selectors

<!-- Generated from packages/locator-intelligence/src/explanations.ts by `pnpm docs:rules`. Do not edit by hand. -->

> **Category:** locator · **Default severity:** error

A CSS :nth-child() or :nth-last-child() selector depends on sibling order and breaks when items move.

## Why it matters

Positional locators assume a fixed order and count of elements. Adding, removing, or reordering items — common as features evolve or data changes — silently retargets the locator to the wrong element.

## Example

**Avoid**

```ts
await page.locator('ul li:nth-child(2)').click()
```

**Prefer**

```ts
await page.getByRole('link', { name: 'Settings' }).click()
```

## Guidance

- Target the element by something it owns — its name, label, or text.
- If you must work within a list, scope by a stable attribute rather than an index.

## Does not fire on

```ts
page.getByRole('row').nth(1)   // positional API access — see avoid-positional-access
page.locator('li:nth-of-type(2)') // a type-based sibling filter, not a positional index
page.locator('[data-nth-child]')  // an attribute that merely contains the word
```

## In the CLI

- `testpilot explain no-nth-child` prints this page in the terminal.
- Disable or re-level it in `testpilot.config.ts`: `rules: { 'no-nth-child': 'off' | 'info' | 'warn' | 'error' }`.
- Adopting on an existing suite? Record a baseline (`testpilot analyze --baseline testpilot-baseline.json --update-baseline`) and gate on new findings only.

[← All rules](README.md)
