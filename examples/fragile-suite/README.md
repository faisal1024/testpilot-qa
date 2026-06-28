# Example: fragile-suite

A tiny, **intentionally fragile** Playwright spec used to demonstrate `testpilot analyze`. It is not
meant to run — it has no `playwright.config.ts`, needs no browsers, and exists only to show what the
analyzer reports.

`tests/checkout.spec.ts` mixes anti-patterns with one good locator:

| Line | Pattern | Rule |
|---|---|---|
| `page.locator('//button[@id="place-order"]')` | XPath | `no-xpath` |
| `page.locator('.cart-summary .total')` | CSS class selector | `no-css-class-selector` |
| `page.waitForTimeout(2000)` | hard wait | `no-hard-wait` |
| `page.getByRole('heading', { name: 'Order confirmed' })` | user-facing locator ✅ | (no finding) |

## Run the analyzer

From the repository root:

```bash
npx testpilot-qa analyze examples/fragile-suite
npx testpilot-qa analyze examples/fragile-suite --json
```

You should see findings for `no-xpath`, `no-css-class-selector`, and `no-hard-wait`, plus a Locator
Quality Score. Learn why any rule matters with, e.g.:

```bash
npx testpilot-qa explain no-xpath
```

The analysis is static (Tier 1): it flags categories of problems and gives category-level guidance —
it does not inspect the DOM or produce concrete, DOM-derived replacements.
