import { cssSelectors } from './query.js'
import type { ComplexSelector, ParsedSelector } from './types.js'

/**
 * The deepest combinator chain in any single selector, or `null` when the
 * selector cannot be read.
 *
 * Measured **per selector in a list**, which is the point: the old
 * string-mangling counted `strong em, em strong` as depth 3 by splitting on
 * whitespace, when each of those selectors is one step deep. A comma is not a
 * combinator, and a list of shallow selectors is not a deep chain.
 *
 * Nested selectors (`:has(b > c)`, `:not(.x .y)`) are measured too, but as
 * selectors of their own — the deepest one wins rather than the total. That
 * under-counts a genuinely compound path like `.a b:has(c > d)`, and it is a
 * deliberate floor: an attempt to accumulate instead added depth for
 * `:not()`/`:is()`/`:where()`, whose argument matches the *same* element rather
 * than a descendant, and flagged `form .row > label:not([hidden])` as three
 * steps deep with a message stating a number that was simply wrong. The corpus
 * contains no selector that distinguishes the two models, so there is no
 * evidence to justify the more complex one. Under-reporting is the safe
 * direction for a linter; a confidently wrong depth is not.
 *
 * A `>>` chain does not add across parts either, because each part is matched
 * independently against the previous part's subtree.
 */
export function maxChainDepth(parsed: ParsedSelector): number | null {
  const selectors = cssSelectors(parsed)
  if (selectors === null) {
    return null
  }
  let deepest = 0
  const visit = (list: ComplexSelector[]): void => {
    for (const selector of list) {
      deepest = Math.max(deepest, selector.combinators.length)
      for (const compound of selector.compounds) {
        for (const pseudo of compound.pseudos) {
          if (pseudo.selectors) {
            visit(pseudo.selectors)
          }
        }
      }
    }
  }
  visit(selectors)
  return deepest
}
