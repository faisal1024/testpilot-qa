# `prefer-get-by-test-id` — Use getByTestId() for test ids

<!-- Generated from packages/locator-intelligence/src/explanations.ts by `pnpm docs:rules`. Do not edit by hand. -->

> **Category:** locator · **Default severity:** warn

A test id addressed through a raw CSS attribute selector has an exact getByTestId() equivalent.

## Why it matters

When a locator's only handle is a test id, `locator('[data-testid="save"]')` and `getByTestId('save')` select the same element — but only the second says so. The CSS form hides the intent behind attribute syntax, silently ignores a project's configured `testIdAttribute`, and does not survive a change to it. This is the one case in this category with a mechanical, behavior-preserving rewrite, which is why it is a `warn` where the general nudge is an `info`.

## Example

**Avoid**

```ts
await page.locator('[data-testid="save-button"]').click()
```

**Prefer**

```ts
await page.getByTestId('save-button').click()
```

## Guidance

- Set `testIdAttribute` in `playwright.config.ts` if your project uses something other than `data-testid`, then use getByTestId() everywhere.
- Tell TestPilot which attributes are test ids with `ruleOptions: { 'prefer-get-by-test-id': { testIdAttributes: ['data-qa'] } }` — the default list is `data-testid`, `data-test-id`, `data-test`.
- When the test id is on an **ancestor** — reached by a descendant or `>` step — make it the scope: `locator('[data-testid="list"] li a')` becomes `getByTestId('list').locator('li a')`. **Keep the combinator**: `> li a` must stay `locator('> li a')`, because a chained `locator()` searches every descendant, not just children.
- A `+`/`~` sibling is not an ancestor, and a `>>` part before the test id is a scope `getByTestId()` would drop. The rule stays quiet on both rather than name a rewrite that acts on a different element.
- When the test id sits on the target *alongside* other conditions (`button[data-testid="row"]`), those constrain the same element and cannot move to a chained `locator()` — narrow with `filter()` or `and()` instead.
- A non-equality match such as `[data-testid^="row-"]` has no getByTestId() form; the rule names the attribute without inventing an argument.

## Does not fire on

```ts
page.getByTestId('save-button')        // already the recommended form
page.locator('[data-qa="save"]')       // not a test id unless you configure it
page.locator('[aria-label="Save"]')    // not a test id at all
page.locator('[data-testid]')          // presence: getByTestId() has no such form
page.locator('div:not([data-testid="x"])') // names an element the selector EXCLUDES
page.locator('li:has([data-testid="x"])')  // names a descendant, not the target
page.locator('[data-testid="a"], [data-testid="b"]') // a list has no one target
page.locator('[data-testid="row"] + button')  // a sibling, not an ancestor
page.locator('#modal >> [data-testid="x"]')   // the >> prefix is a scope getByTestId() drops
```

## In the CLI

- `testpilot explain prefer-get-by-test-id` prints this page in the terminal.
- Disable or re-level it in `testpilot.config.ts`: `rules: { 'prefer-get-by-test-id': 'off' | 'info' | 'warn' | 'error' }`.
- Adopting on an existing suite? Record a baseline (`testpilot analyze --baseline testpilot-baseline.json --update-baseline`) and gate on new findings only.

[← All rules](README.md)
