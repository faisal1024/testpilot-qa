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
  /**
   * `scope` only: the ancestor carries more than the test id (a tag, a class,
   * a pseudo). `getByTestId(value)` does not express those, so the rewrite is
   * a widening and the message has to say so — `ul[data-testid=x] > li a`
   * appears four times in the corpus.
   */
  scopeHasOtherConditions?: boolean
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
 * - the test id reaches the target through anything but descendant/child steps;
 * - anything **precedes** the test id's own compound — a `>>` part, or an
 *   earlier compound in the same selector. Both are ancestor scopes
 *   `getByTestId()` would drop: `'#login-modal >> [data-testid=save]'` and
 *   `'#login-modal [data-testid=save]'` are the same locator, and neither is
 *   `getByTestId('save')`, which searches the whole document. A leading
 *   combinator counts — the tokenizer models `'+ [data-testid=row]'` as
 *   `:scope + [data-testid=row]`, an adjacent sibling of the scope rather than
 *   a descendant of it.
 */
export function testIdReplacement(
  parsed: ParsedSelector,
  names: readonly string[],
): TestIdReplacement | null {
  if (parsed.unparsed.length > 0) {
    return null
  }
  // ONE part, and the test id leads it.
  //
  // Not "one part, plus every way a later `>>` part could step outside the
  // subtree". That enumeration was incomplete ten times running: a sibling
  // combinator, then `*:scope`, then `:scope:hover`, then `:is(:scope)`. The
  // set of ways to leave is open — CSS and Playwright keep adding spellings —
  // while the set of shapes that provably stay is small and closed. So this
  // recognises those instead, and says nothing about anything else.
  //
  // `locator('[data-testid=a] >> div')` loses its finding as a result. That is
  // the price of a rule whose entire severity rests on the replacement being
  // right, and it is the cheaper side of the trade.
  if (parsed.parts.length !== 1) {
    return null
  }
  const part = parsed.parts[0]
  if (!part || part.engine !== 'css') {
    return null
  }
  const arm = singleArm(part)
  const target = arm?.compounds.at(-1)
  if (!arm || !target) {
    return null
  }
  const found = findIn(arm.compounds, names)
  // `found.index > 0` means something precedes the test id — an ancestor scope
  // `getByTestId()` would drop. A leading combinator counts: the tokenizer
  // models `'+ [data-testid=x]'` as `:scope + [data-testid=x]`, so the test id
  // is at index 1 and this rejects it without needing to recognise `:scope` in
  // any of its spellings.
  if (!found || found.index > 0) {
    return null
  }
  const exactValue = exactValueOf(found.match)
  if (found.index === arm.compounds.length - 1) {
    return {
      kind: isOnlyHandle(target) ? 'direct' : 'same-element',
      attribute: found.match.name,
      exactValue,
    }
  }
  // Provably an ancestor: every step from it to the target is a containment
  // step, inside one selector, with no engine boundary to reason across.
  if (!arm.combinators.every((step) => SCOPING_COMBINATORS.has(step))) {
    return null
  }
  return {
    kind: 'scope',
    attribute: found.match.name,
    exactValue,
    scopeHasOtherConditions: !isOnlyHandle(arm.compounds[0] as CompoundSelector),
  }
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
