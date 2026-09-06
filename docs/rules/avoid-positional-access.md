# `avoid-positional-access` — Prefer identity over position

<!-- Generated from packages/locator-intelligence/src/explanations.ts by `pnpm docs:rules`. Do not edit by hand. -->

> **Category:** locator · **Default severity:** warn

Selecting by position (.first(), .last(), .nth(n)) depends on how many elements match and in what order.

## Why it matters

A positional call silently retargets when the matched collection changes — a new row, a reordered list, a filter applied earlier in the test. It does not fail loudly; it acts on a different element. That said, picking one of an intentionally repeated element is idiomatic Playwright and appears throughout its own docs, which is why this is a `warn` and not an error: it is a nudge to check whether the element has an identity you could target instead.

## Example

**Avoid**

```ts
await page.getByRole('listitem').first().click()
```

**Prefer**

```ts
await page.getByRole('link', { name: 'Settings' }).click()
```

## Guidance

- If the element is distinguishable — a name, a label, a test id — target it directly.
- If the collection is genuinely uniform (a row in a results table), positional access is fine; silence this rule for the file or set it to `off`.
- CSS `:nth-child()` is a different matter and stays an error — see `no-nth-child`.

## Does not fire on

```ts
page.getByRole('button', { name: 'Save' })  // targeted by identity, not position
page.locator('li:nth-child(2)')             // a CSS positional selector — see no-nth-child
```

## In the CLI

- `testpilot explain avoid-positional-access` prints this page in the terminal.
- Disable or re-level it in `testpilot.config.ts`: `rules: { 'avoid-positional-access': 'off' | 'info' | 'warn' | 'error' }`.
- Adopting on an existing suite? Record a baseline (`testpilot analyze --baseline testpilot-baseline.json --update-baseline`) and gate on new findings only.

[← All rules](README.md)
