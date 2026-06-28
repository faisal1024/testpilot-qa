import { expect, test } from '@playwright/test'

// This is an intentionally fragile example suite used to demonstrate
// `testpilot analyze`. Do not copy these patterns — see the findings instead.

test('checkout flow (fragile locators)', async ({ page }) => {
  await page.goto('/checkout')

  // ❌ XPath — couples the test to DOM structure (no-xpath)
  await page.locator('//button[@id="place-order"]').click()

  // ❌ CSS class selector — class names change with styling (no-css-class-selector)
  await page.locator('.cart-summary .total').click()

  // ❌ Hard wait — slow and flaky (no-hard-wait)
  await page.waitForTimeout(2000)

  // ✅ Good: a resilient, user-facing locator with a web-first assertion
  await expect(page.getByRole('heading', { name: 'Order confirmed' })).toBeVisible()
})
