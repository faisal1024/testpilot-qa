/**
 * Rules that were split or renamed, and where their findings went.
 *
 * Two contracts depend on a rule's id, and both break silently without this:
 *
 * 1. **`--baseline`.** A finding's identity is `(ruleId, file, snippet)`, so a
 *    renamed id makes every already-accepted finding read as new. Splitting
 *    `.nth()` out of `no-nth-child` would have failed a green CI on cal.com
 *    with 114 "new" findings and not one line of test code changed.
 * 2. **`rules: { 'no-nth-child': 'off' }`.** A team that silenced a rule gets
 *    it back under an id they have never heard of.
 *
 * Keyed by the **old** id, so a config or baseline written before the split
 * keeps working. Entries stay indefinitely: they are cheap, and the cost of
 * removing one is a silent red build on somebody's brownfield suite.
 */
export const RULE_SUCCESSORS: Readonly<Record<string, readonly string[]>> = {
  // Phase 11e: positional API access (`.nth()`) left the CSS-pseudo rule.
  'no-nth-child': ['avoid-positional-access'],
  // Phase 11f: the `locator('..')` idiom left the hand-written-XPath rule.
  'no-xpath': ['avoid-parent-traversal'],
}

/** The inverse: which old ids a current rule's findings may have been recorded under. */
export const RULE_PREDECESSORS: Readonly<Record<string, readonly string[]>> = Object.entries(
  RULE_SUCCESSORS,
).reduce<Record<string, string[]>>((accumulator, [previous, successors]) => {
  for (const successor of successors) {
    accumulator[successor] = [...(accumulator[successor] ?? []), previous]
  }
  return accumulator
}, {})

/** Old rule ids that are still meaningful in config, mapped to their replacements. */
export const DEPRECATED_RULE_IDS = Object.keys(RULE_SUCCESSORS)
