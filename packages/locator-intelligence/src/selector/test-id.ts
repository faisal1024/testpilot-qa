import type {
  AttributeSelector,
  ComplexSelector,
  CompoundSelector,
  ParsedSelector,
  SelectorPart,
} from './types.js'

/**
 * How a test id in a selector relates to the element the locator targets.
 *
 * - `direct` — the test id is the whole of what selects the target.
 *   `getByTestId(value)` is the same locator.
 * - `scope` — the test id is on an **ancestor**: `getByTestId(value).locator(…)`.
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

/** `>` and a descendant space are the only combinators that make a scope. */
const SCOPING_COMBINATORS = new Set(['descendant', 'child'])

/**
 * Reads a selector's test id and where it sits, or `null` when there is nothing
 * safe to say.
 *
 * Extracted from the rule so the rule, the `fix` command and any later
 * auto-fixer share one answer. Three programs deciding what a test id is, is
 * how a measurement script ends up disagreeing with the shipped rule — the
 * mistake this phase made four times, relocated from measuring to fixing.
 *
 * Naming a rewrite is the strongest claim this package makes, so this walks the
 * combinators rather than trusting position. `[data-testid="row"] + button`
 * puts the test id on a **sibling**: calling it an ancestor is a false
 * statement about the DOM, and `getByTestId('row').locator('button')` searches
 * row's subtree — a different element. Two review rounds produced this defect
 * in two different shapes, which is why the structure is now explicit.
 *
 * Returns `null` when:
 * - the selector could not be read;
 * - the test id appears only inside a pseudo-class argument — in
 *   `div:not([data-testid=x])` it names an element the selector *excludes*, and
 *   in `li:has([data-testid=x])` a descendant;
 * - the match is a bare presence check (`[data-testid]`), which `getByTestId()`
 *   has no form for;
 * - any relevant part is a selector **list**, which has more than one target or
 *   more than one scope;
 * - the test id reaches the target through anything but descendant/child steps.
 */
export function testIdReplacement(
  parsed: ParsedSelector,
  names: readonly string[],
): TestIdReplacement | null {
  if (parsed.unparsed.length > 0) {
    return null
  }
  const last = parsed.parts.at(-1)
  if (!last || last.engine !== 'css') {
    return null
  }
  const arm = singleArm(last)
  if (!arm) {
    return null
  }
  const target = arm.compounds.at(-1)
  if (!target) {
    return null
  }

  // The target's own selector first: it is the only place a `direct` or
  // `same-element` answer can come from.
  const found = findIn(arm.compounds, names)
  if (found) {
    if (found.index === arm.compounds.length - 1) {
      return {
        kind: isOnlyHandle(target) ? 'direct' : 'same-element',
        attribute: found.match.name,
        exactValue: exactValueOf(found.match),
      }
    }
    // Every step from the match to the target must be a containment step.
    const steps = arm.combinators.slice(found.index, arm.compounds.length - 1)
    if (!steps.every((step) => SCOPING_COMBINATORS.has(step))) {
      return null
    }
    return { kind: 'scope', attribute: found.match.name, exactValue: exactValueOf(found.match) }
  }

  // Otherwise an earlier `>>` part, which chains as a scope. The match has to
  // be on that part's own target — `[data-testid=a] + div >> button` scopes
  // from the div, and the test id is that div's sibling.
  for (const part of parsed.parts.slice(0, -1)) {
    if (part.engine !== 'css') {
      continue
    }
    const earlier = singleArm(part)
    if (!earlier) {
      return null
    }
    const tail = earlier.compounds.at(-1)
    const match = tail && matchIn(tail, names)
    if (match) {
      return { kind: 'scope', attribute: match.name, exactValue: exactValueOf(match) }
    }
  }
  return null
}

/** The one selector in a part, or `null` when the part is a list (or unparsed). */
function singleArm(part: SelectorPart): ComplexSelector | null {
  return part.css?.length === 1 ? (part.css[0] ?? null) : null
}

/** The first usable test-id attribute in a compound. */
function matchIn(compound: CompoundSelector, names: readonly string[]): AttributeSelector | null {
  return (
    compound.attributes.find(
      // A bare `[data-testid]` asks "does this have a test id at all", which
      // `getByTestId()` has no form for.
      (attribute) => names.includes(attribute.name) && attribute.operator !== undefined,
    ) ?? null
  )
}

/** The first usable test-id attribute across a compound chain, with its index. */
function findIn(
  compounds: CompoundSelector[],
  names: readonly string[],
): { match: AttributeSelector; index: number } | null {
  for (const [index, compound] of compounds.entries()) {
    const match = matchIn(compound, names)
    if (match) {
      return { match, index }
    }
  }
  return null
}

/**
 * The value when `getByTestId(value)` is the same match, else `undefined`.
 *
 * `getByTestId` compiles to an exact, case-sensitive equality, so `^=`, `*=`
 * and friends are not it — and neither is `[data-testid="save" i]`, which also
 * matches `SAVE`.
 */
function exactValueOf(attribute: AttributeSelector): string | undefined {
  return attribute.operator === '=' && attribute.caseInsensitive !== true
    ? attribute.value
    : undefined
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
