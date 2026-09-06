import { isParentTraversal } from './avoid-parent-traversal.js'
import type { Rule } from './types.js'

/**
 * Flags XPath selectors, which couple tests tightly to DOM structure.
 *
 * The `locator('..')` parent step is XPath too, but it is a recognised
 * Playwright idiom rather than a hand-written path expression, so it has its
 * own `info` rule. On the corpus it was 9 of the 11 xpath findings — reporting
 * it here at `error` meant the real XPath did not stand out.
 */
export const noXpath: Rule = {
  id: 'no-xpath',
  category: 'locator',
  defaultSeverity: 'error',
  docsUrl: 'https://github.com/faisal1024/testpilot-qa/blob/main/docs/rules/no-xpath.md',
  evaluate(context) {
    if (context.isDynamic || context.selectorEngine !== 'xpath') {
      return null
    }
    if (isParentTraversal(context)) {
      return null
    }
    return {
      message: 'XPath selectors are brittle and break on DOM structure changes.',
      suggestion: 'Prefer a user-facing locator such as getByRole(), getByLabel(), or getByText().',
    }
  },
}
