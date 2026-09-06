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
 * Nesting accumulates: `.a b:has(c > d > e)` really does depend on the path to
 * `b` *and* the path below it. A `>>` chain does not add across parts, because
 * each part is matched independently against the previous part's subtree.
 */
export function maxChainDepth(parsed: ParsedSelector): number | null {
  const selectors = cssSelectors(parsed)
  if (selectors === null) {
    return null
  }
  let deepest = 0
  // `outer` is the depth already traversed to reach this list. A nested
  // `:has()` continues the chain rather than restarting it: `.a b:has(c > d)`
  // walks one step to `b`, one more into the `:has()` subject, then two more —
  // taking the maximum instead reported 2 and called it clean.
  const visit = (list: ComplexSelector[], outer: number): void => {
    for (const selector of list) {
      const depth = outer + selector.combinators.length
      deepest = Math.max(deepest, depth)
      for (const [index, compound] of selector.compounds.entries()) {
        for (const pseudo of compound.pseudos) {
          if (pseudo.selectors) {
            visit(pseudo.selectors, outer + index + 1)
          }
        }
      }
    }
  }
  visit(selectors, 0)
  return deepest
}
