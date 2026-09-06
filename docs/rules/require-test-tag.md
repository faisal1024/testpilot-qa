# `require-test-tag` — Tag every test

<!-- Generated from packages/locator-intelligence/src/explanations.ts by `pnpm docs:rules`. Do not edit by hand. -->

> **Category:** maintainability · **Default severity:** info

A test with no tag cannot be selected by any tag-based run, so it silently misses every suite.

## Why it matters

Once a team runs subsets by tag — a smoke suite on every PR, a nightly regression run — an untagged test belongs to none of them. It still runs in the full suite, so nothing fails; it just quietly stops being covered by the runs people actually watch. This rule is off by default and only worth enabling once you have a vocabulary to be consistent with.

## Example

**Avoid**

```ts
test('checkout works', async ({ page }) => { … })
```

**Prefer**

```ts
test('checkout works @smoke', async ({ page }) => { … })
// or
test('checkout works', { tag: ['@smoke'] }, async ({ page }) => { … })
```

## Guidance

- Run `testpilot tags` first — tag from the vocabulary the suite already uses, not a new one.
- A tag on a `test.describe` counts for every test inside it, which is usually the cheapest way to cover a group.
- Enable with `rules: { 'require-test-tag': 'info' }`; it is `off` by default.
- Findings from this rule are counted but not scored — the Locator Quality Score measures locators, over a denominator of call sites.

## In the CLI

- `testpilot explain require-test-tag` prints this page in the terminal.
- Disable or re-level it in `testpilot.config.ts`: `rules: { 'require-test-tag': 'off' | 'info' | 'warn' | 'error' }`.
- Adopting on an existing suite? Record a baseline (`testpilot analyze --baseline testpilot-baseline.json --update-baseline`) and gate on new findings only.

[← All rules](README.md)
