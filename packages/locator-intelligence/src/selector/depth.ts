import { cssSelectors } from './query.js'
import type { ComplexSelector, ParsedSelector } from './types.js'

/**
 * The deepest combinator chain in a selector, or `null` when it cannot be read.
 *
 * Depth is measured **per selector in a list**, which is the whole point: the
 * old string-mangling counted `strong em, em strong` as depth 3 by splitting on
 * whitespace, when each of those selectors is one step deep. A comma is not a
 * combinator, and a list of shallow selectors is not a deep chain.
 *
 * Nested selectors count — `.a:has(b > c > d)` really does depend on four levels
 * of structure — but a `>>` chain does not add across parts, because each part
 * is matched independently against the previous part's subtree.
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
