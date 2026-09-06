import { hasPseudo } from '../selector/query.js'
import type { Rule } from './types.js'

/**
 * Flags CSS `:nth-child()`, which depends on sibling order.
 *
 * Stays **error**: a positional CSS selector breaks whenever a sibling is
 * added, removed or reordered, and there is essentially never a reason to
 * prefer one. Positional *API* access (`.first()`, `.nth()`) is a different
 * judgement and lives in `avoid-positional-access` at `warn`.
 *
 * Reads the tokenized selector, so `[title=":nth-child(2)"]` — the pseudo's
 * name inside an attribute *value* — no longer fires.
 */
export const noNthChild: Rule = {
  id: 'no-nth-child',
  category: 'locator',
  defaultSeverity: 'error',
  docsUrl: 'https://github.com/faisal1024/testpilot-qa/blob/main/docs/rules/no-nth-child.md',
  evaluate(context) {
    if (context.isDynamic || context.apiCall !== 'locator' || !context.parsed) {
      return null
    }
    const found = hasPseudo(context.parsed, new Set(['nth-child', 'nth-last-child']))
    if (found !== true) {
      return null
    }
    return {
      message: 'CSS :nth-child() selectors depend on sibling order and break easily.',
      suggestion: 'Prefer a stable user-facing locator such as getByRole() or getByTestId().',
    }
  },
}
