import type { Rule } from './types.js'

/**
 * Flags raw `page.locator()` CSS/text selectors that are usually better
 * expressed as user-facing locators. This is the general nudge that layers on
 * top of the specific anti-pattern rules; it offers category-level guidance
 * only (no concrete replacement, which would require DOM context).
 */
export const preferUserFacingLocator: Rule = {
  id: 'prefer-user-facing-locator',
  category: 'locator',
  defaultSeverity: 'warn',
  docsUrl: 'https://testpilot.dev/rules/prefer-user-facing-locator',
  evaluate(context) {
    if (context.isDynamic || context.apiCall !== 'locator') {
      return null
    }
    if (context.selectorEngine === 'css' || context.selectorEngine === 'text') {
      return {
        message: 'Raw locator() selectors are less resilient than user-facing locators.',
        suggestion: 'Prefer getByRole(), getByLabel(), getByText(), or getByTestId().',
      }
    }
    return null
  },
}
