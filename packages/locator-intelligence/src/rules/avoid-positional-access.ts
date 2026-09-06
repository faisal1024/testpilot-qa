import type { Rule } from './types.js'

/**
 * Flags positional locator access: `.first()`, `.last()`, `.nth(n)`.
 *
 * **info**, and split out of `no-nth-child` deliberately. Picking the first of
 * an intentionally repeated element — a row in a table, an item in a list — is
 * idiomatic Playwright and appears throughout its own docs.
 *
 * It handles `.first()`/`.last()` too, but the extractor does not yet emit
 * them. Doing so is not a rule change: it adds ~10% more call sites, which is
 * the score's **denominator**, and measured on the corpus it moves every score
 * by 3-8 points in one direction or the other depending on this rule's
 * severity — enough to flip a `--min-score 70` gate on cal.com. The denominator
 * is Phase 12's subject; a precision PR must not move the score sideways while
 * claiming to be about false positives. The rule is ready for them.
 */
export const avoidPositionalAccess: Rule = {
  id: 'avoid-positional-access',
  category: 'locator',
  defaultSeverity: 'warn',
  docsUrl:
    'https://github.com/faisal1024/testpilot-qa/blob/main/docs/rules/avoid-positional-access.md',
  evaluate(context) {
    if (context.apiCall !== 'nth' && context.apiCall !== 'first' && context.apiCall !== 'last') {
      return null
    }
    // Telling someone already using getByTestId() to "use getByTestId()" is the
    // finding being unactionable. On cal.com the four commonest shapes are all
    // `getByTestId(...).nth(0)`, so the useful advice there is narrowing, not
    // re-locating.
    const alreadyTargeted = context.parentApi?.startsWith('getBy')
    return {
      message: `Positional access (.${context.apiCall}()) depends on how many elements match and in what order.`,
      suggestion: alreadyTargeted
        ? `The ${context.parentApi}() already narrows this — if the match is ambiguous, prefer .filter({ hasText }) or a more specific name over an index. If the collection is intentionally repeated (a row, a list item), this is fine.`
        : 'Where the element is distinguishable, target it directly — getByRole() with a name, or getByTestId(). Positional access over an intentionally repeated element is fine.',
    }
  },
}
