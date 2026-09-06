# `no-hard-wait` — Avoid hard waits

<!-- Generated from packages/locator-intelligence/src/explanations.ts by `pnpm docs:rules`. Do not edit by hand. -->

> **Category:** flakiness · **Default severity:** error

Fixed waitForTimeout() sleeps make tests slow and flaky.

## Why it matters

A hard wait is either too long (wasting time when the app was ready sooner) or too short (flaky failures under load). Playwright auto-waits for elements to be actionable and for assertions to pass, so fixed sleeps are almost never necessary.

## Example

**Avoid**

```ts
await page.waitForTimeout(1000)
await page.getByRole('button', { name: 'Save' }).click()
```

**Prefer**

```ts
// Playwright auto-waits for actionability; assert the state you need:
await page.getByRole('button', { name: 'Save' }).click()
await expect(page.getByRole('alert')).toHaveText('Saved')
```

## Guidance

- Rely on Playwright auto-waiting for actionability.
- Use web-first assertions like expect(locator).toBeVisible() / toHaveText().
- Wait for a specific condition (e.g. waitForResponse) instead of a fixed delay.

## Does not fire on

```ts
await expect(page.getByText('Saved')).toBeVisible()  // a web-first assertion, which waits
await page.getByRole('button').click()               // auto-waiting is built in
```

## In the CLI

- `testpilot explain no-hard-wait` prints this page in the terminal.
- Disable or re-level it in `testpilot.config.ts`: `rules: { 'no-hard-wait': 'off' | 'info' | 'warn' | 'error' }`.
- Adopting on an existing suite? Record a baseline (`testpilot analyze --baseline testpilot-baseline.json --update-baseline`) and gate on new findings only.

[← All rules](README.md)
