import { targetCompound, topLevelAttributeTokens } from './query.js'
import type { AttributeSelector, CompoundSelector, ParsedSelector } from './types.js'

/**
 * How a test id in a selector relates to the element the locator targets.
 *
 * - `direct` — the test id is the whole of what selects the target.
 *   `getByTestId(value)` is the same locator.
 * - `scope` — the test id is on a strictly *earlier* compound, so it is an
 *   ancestor: `getByTestId(value).locator(<the rest>)`.
 * - `same-element` — the test id is on the target, alongside other conditions.
 *   The rest constrains the *same* element, so it cannot move to a chained
 *   `locator()`, which queries the subtree.
 */
export interface TestIdReplacement {
  kind: 'direct' | 'scope' | 'same-element'
  attribute: string
  /** The value, only when `getByTestId(value)` is the identical match. */
  exactValue?: string
}

/**
 * Reads a selector's test id and where it sits, or `null` when there is nothing
 * safe to say.
 *
 * Extracted from the rule so the rule, the `fix` command and any later
 * auto-fixer share one answer. Three programs deciding what a test id is, is
 * how a measurement script ends up disagreeing with the shipped rule — the
 * mistake this phase made four times, relocated from measuring to fixing.
 *
 * Returns `null` when:
 * - the selector could not be read;
 * - the test id appears only inside a pseudo-class argument — in
 *   `div:not([data-testid=x])` it names an element the selector *excludes*, and
 *   in `li:has([data-testid=x])` a descendant;
 * - the match is a bare presence check (`[data-testid]`), which `getByTestId()`
 *   has no form for;
 * - the target element is not identifiable: a selector list has more than one,
 *   and a non-CSS final `>>` part belongs to another engine.
 */
export function testIdReplacement(
  parsed: ParsedSelector,
  names: readonly string[],
): TestIdReplacement | null {
  const attributes = topLevelAttributeTokens(parsed)
  if (attributes === null) {
    return null
  }
  const match = attributes.find((attribute) => names.includes(attribute.name))
  if (!match || match.operator === undefined) {
    return null
  }
  const target = targetCompound(parsed)
  if (target === null) {
    return null
  }
  const exactValue = isExact(match) ? match.value : undefined
  if (!target.attributes.includes(match)) {
    return { kind: 'scope', attribute: match.name, exactValue }
  }
  return {
    kind: isOnlyHandle(target) ? 'direct' : 'same-element',
    attribute: match.name,
    exactValue,
  }
}

/**
 * True when `getByTestId(value)` is the same match.
 *
 * `getByTestId` compiles to an exact, case-sensitive equality, so `^=`, `*=`
 * and friends are not it — and neither is `[data-testid="save" i]`, which also
 * matches `SAVE`. Printing a replacement for those would be the confidently
 * wrong rewrite the narrow conditions here exist to prevent.
 */
function isExact(attribute: AttributeSelector): boolean {
  return (
    attribute.operator === '=' &&
    attribute.caseInsensitive !== true &&
    attribute.value !== undefined
  )
}

/** True when the test id is the whole of what selects this element. */
function isOnlyHandle(target: CompoundSelector): boolean {
  return (
    // `*[data-testid=x]` and `[data-testid=x]` are the same selector.
    (target.tag === undefined || target.tag === '*') &&
    target.id === undefined &&
    target.classes.length === 0 &&
    target.pseudos.length === 0 &&
    target.attributes.length === 1
  )
}
