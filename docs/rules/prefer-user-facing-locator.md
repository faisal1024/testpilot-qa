# `prefer-user-facing-locator` — Prefer user-facing locators

<!-- Generated from packages/locator-intelligence/src/explanations.ts by `pnpm docs:rules`. Do not edit by hand. -->

> **Category:** locator · **Default severity:** warn

Raw CSS/text locator() strings are less resilient than Playwright user-facing locators.

## Why it matters

Playwright recommends locating elements the way users and assistive technology perceive them — by role, label, placeholder, or text. Those locators survive refactors and double as lightweight accessibility checks; raw locator() css/text strings bypass that resilience.

## Example

**Avoid**

```ts
await page.locator('input[name="email"]').fill('user@example.com')
```

**Prefer**

```ts
await page.getByLabel('Email').fill('user@example.com')
```

## Guidance

- Reach for getByRole / getByLabel / getByPlaceholder / getByText first.
- Use getByTestId when there is no good semantic handle.
- Keep locator() for cases none of the above can express.

## In the CLI

- `testpilot explain prefer-user-facing-locator` prints this page in the terminal.
- Disable or re-level it in `testpilot.config.ts`: `rules: { 'prefer-user-facing-locator': 'off' | 'info' | 'warn' | 'error' }`.
- Adopting on an existing suite? Record a baseline (`testpilot analyze --baseline testpilot-baseline.json --update-baseline`) and gate on new findings only.

[← All rules](README.md)
