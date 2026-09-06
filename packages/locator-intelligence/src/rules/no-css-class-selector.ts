import { classTokens } from '../selector/query.js'
import type { Rule } from './types.js'

/**
 * Flags CSS class selectors, which are coupled to styling and change often.
 *
 * Reads the tokenized selector rather than scanning for a `.`: the old regex
 * `/\.[a-zA-Z_-]/` fired on `[href=".pdf"]` (a dot inside a quoted attribute
 * value), on `text=Save file.txt`, and split Tailwind's `.mt-1\.5` in two. None
 * of those is a class selector, and all three appear in real suites.
 *
 * `#id` selectors are deliberately not this rule's business — they are a
 * different trade-off, and lumping them in here made the finding unactionable.
 */
export const noCssClassSelector: Rule = {
  id: 'no-css-class-selector',
  category: 'locator',
  defaultSeverity: 'error',
  docsUrl:
    'https://github.com/faisal1024/testpilot-qa/blob/main/docs/rules/no-css-class-selector.md',
  evaluate(context) {
    if (context.isDynamic || context.apiCall !== 'locator' || !context.parsed) {
      return null
    }
    const classes = classTokens(context.parsed)
    if (classes === null || classes.length === 0) {
      return null
    }
    return {
      message: `CSS class selector${classes.length > 1 ? 's' : ''} (${classes
        .map((name) => `.${name}`)
        .join(', ')}) are coupled to styling and change frequently.`,
      suggestion: 'Prefer getByRole() or getByTestId() over class-based selectors.',
    }
  },
}
