# `avoid-parent-traversal` — Avoid locator('..') parent traversal

<!-- Generated from packages/locator-intelligence/src/explanations.ts by `pnpm docs:rules`. Do not edit by hand. -->

> **Category:** locator · **Default severity:** info

locator('..') walks up to the parent element, so the test depends on how the DOM is nested.

## Why it matters

Reaching a container by walking up from a child couples the test to the exact nesting between them: wrap the child in one more div and the locator points somewhere else. It is a recognised Playwright idiom rather than hand-written XPath, which is why it is `info` and lives apart from `no-xpath` — on real suites it was the majority of that rule's findings, and reporting it at error meant the genuinely hand-written XPath did not stand out.

## Example

**Avoid**

```ts
await page.getByText('Total').locator('..').click()
```

**Prefer**

```ts
await page.getByRole('row', { name: 'Total' }).click()
```

## Guidance

- Locate the container directly — getByRole with a name, or getByTestId — then narrow inside it.
- If the container genuinely has no handle of its own, adding a data-testid to it is usually the smaller change.

## Does not fire on

```ts
page.locator('//button[@type="submit"]')  // hand-written XPath — see no-xpath
page.getByRole('row').getByRole('cell')   // narrowing down, not walking up
```

## In the CLI

- `testpilot explain avoid-parent-traversal` prints this page in the terminal.
- Disable or re-level it in `testpilot.config.ts`: `rules: { 'avoid-parent-traversal': 'off' | 'info' | 'warn' | 'error' }`.
- Adopting on an existing suite? Record a baseline (`testpilot analyze --baseline testpilot-baseline.json --update-baseline`) and gate on new findings only.

[← All rules](README.md)
