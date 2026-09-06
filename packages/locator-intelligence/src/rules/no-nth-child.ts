import { hasPseudo } from '../selector/query.js'
import type { Rule } from './types.js'

/** Both are sibling-index selectors; the parsed pseudo covers each. */
const POSITIONAL_PSEUDOS = new Set(['nth-child', 'nth-last-child'])

/**
 * Flags CSS `:nth-child()` and `:nth-last-child()`, which depend on sibling
 * order. The move to the parsed pseudo added `:nth-last-child()`, which the old
 * `:nth-child(` substring check missed.
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
    const found = hasPseudo(context.parsed, POSITIONAL_PSEUDOS)
    if (found !== true) {
      return null
    }
    return {
      // Names both, because moving to the parsed pseudo widened this from a
      // `:nth-child(` substring match to `:nth-last-child()` as well — a user
      // flagged on the latter should not read a message about the former.
      message:
        'CSS :nth-child() / :nth-last-child() selectors depend on sibling order and break easily.',
      suggestion: 'Prefer a stable user-facing locator such as getByRole() or getByTestId().',
    }
  },
}
