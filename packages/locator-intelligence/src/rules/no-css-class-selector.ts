import type { Rule } from './types.js'

// A `.` immediately followed by a class-name start character. Within a CSS
// selector this signals a class selector (`.btn-primary`, `button.primary`).
const CLASS_SELECTOR = /\.[a-zA-Z_-]/

/** Flags CSS class selectors, which are coupled to styling and change often. */
export const noCssClassSelector: Rule = {
  id: 'no-css-class-selector',
  category: 'locator',
  defaultSeverity: 'error',
  docsUrl: 'https://testpilot.dev/rules/no-css-class-selector',
  evaluate(context) {
    if (context.isDynamic || context.apiCall !== 'locator') {
      return null
    }
    if (context.selectorEngine !== 'css' || context.selector === undefined) {
      return null
    }
    if (CLASS_SELECTOR.test(context.selector)) {
      return {
        message: 'CSS class selectors are coupled to styling and change frequently.',
        suggestion: 'Prefer getByRole() or getByTestId() over class-based selectors.',
      }
    }
    return null
  },
}
