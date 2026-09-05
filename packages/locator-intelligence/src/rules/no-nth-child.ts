import type { Rule } from './types.js'

/** Flags positional selection: CSS `:nth-child(...)` and locator `.nth(...)` chains. */
export const noNthChild: Rule = {
  id: 'no-nth-child',
  category: 'locator',
  defaultSeverity: 'error',
  docsUrl: 'https://github.com/faisal1024/testpilot-qa/blob/main/docs/rules/no-nth-child.md',
  evaluate(context) {
    if (context.apiCall === 'nth') {
      return {
        message: 'Positional .nth() selection is order-dependent and brittle.',
        suggestion:
          'Target the element by something it owns, e.g. getByRole() with a name or getByTestId().',
      }
    }
    if (context.isDynamic || context.apiCall !== 'locator') {
      return null
    }
    if (context.selectorEngine === 'css' && context.selector?.includes(':nth-child(')) {
      return {
        message: 'CSS :nth-child() selectors depend on sibling order and break easily.',
        suggestion: 'Prefer a stable user-facing locator such as getByRole() or getByTestId().',
      }
    }
    return null
  },
}
