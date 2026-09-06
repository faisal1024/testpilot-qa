# `prefer-semantic-locator` — Prefer a semantic locator

<!-- Generated from packages/locator-intelligence/src/explanations.ts by `pnpm docs:rules`. Do not edit by hand. -->

> **Category:** locator · **Default severity:** info

A raw tag, class, #id or text= selector says nothing about what the element is to a user.

## Why it matters

Playwright recommends locating elements the way users and assistive technology perceive them — by role, label, placeholder, or text. Those locators survive refactors and double as lightweight accessibility checks. A selector built from structure alone breaks whenever the markup moves, for reasons unrelated to the feature under test. Tier 1 is static, so this rule cannot name the replacement — it is a nudge to look, which is why it ships at `info` and not `warn`.

## Example

**Avoid**

```ts
await page.locator('#login-form div.actions > button').click()
```

**Prefer**

```ts
await page.getByRole('button', { name: 'Log in' }).click()
```

## Guidance

- Reach for getByRole / getByLabel / getByPlaceholder / getByText first.
- Use getByTestId when there is genuinely no semantic handle — and add the test id to the markup rather than reaching for a class.
- Keep locator() for what none of the above can express; set this rule to `off` if your suite has made that call deliberately.

## Does not fire on

```ts
page.locator('[role="tab"]')                    // a role is a semantic handle
page.locator('[aria-label="Close"]')            // so is any aria-* attribute
page.locator('.row', { hasText: 'Save' })       // composed: the selector is a scope
page.locator('li:has-text("Save")')             // the same composition, in selector syntax
page.getByRole('row').locator('td')             // narrowing a user-facing parent
page.locator('[data-testid="save"]')            // see prefer-get-by-test-id
```

## In the CLI

- `testpilot explain prefer-semantic-locator` prints this page in the terminal.
- Disable or re-level it in `testpilot.config.ts`: `rules: { 'prefer-semantic-locator': 'off' | 'info' | 'warn' | 'error' }`.
- Adopting on an existing suite? Record a baseline (`testpilot analyze --baseline testpilot-baseline.json --update-baseline`) and gate on new findings only.

[← All rules](README.md)
