import type { Rule } from './types.js'

/** Flags XPath selectors, which couple tests tightly to DOM structure. */
export const noXpath: Rule = {
  id: 'no-xpath',
  category: 'locator',
  defaultSeverity: 'error',
  docsUrl: 'https://testpilot.dev/rules/no-xpath',
  evaluate(context) {
    if (context.isDynamic) {
      return null
    }
    if (context.selectorEngine === 'xpath') {
      return {
        message: 'XPath selectors are brittle and break on DOM structure changes.',
        suggestion:
          'Prefer a user-facing locator such as getByRole(), getByLabel(), or getByText().',
      }
    }
    return null
  },
}
