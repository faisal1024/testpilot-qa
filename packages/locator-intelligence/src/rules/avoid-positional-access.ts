import type { Rule } from './types.js'

/**
 * Flags positional locator access: `.first()`, `.last()`, `.nth(n)`.
 *
 * **info**, and split out of `no-nth-child` deliberately. Picking the first of
 * an intentionally repeated element — a row in a table, an item in a list — is
 * idiomatic Playwright and appears throughout its own docs.
 *
 * It handles `.first()`/`.last()` too, but the extractor does not yet emit
 * them. Deferred to Phase 12, which owns the denominator.
 * Measured with the real code path by adding them to LOCATOR_METHODS and re-running the corpus: callSites +7.9% cal.com, +4.0% immich, +50.5% Ghost, +7.4% documenso, +8.4% mattermost; scores 74->73, 91->90, 99->86, 91->89, 67->66.
 * Ghost loses 13 points because half its locator calls are positional.
 * Bundling that with this release's severity re-grade would put two unrelated mechanisms on the same number in one release, and callSites is byte-identical here precisely so a reader can attribute the movement.
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
