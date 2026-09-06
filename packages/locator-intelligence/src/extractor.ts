import type { AnalyzedApi, LocatorApi, LocatorContext, SelectorEngine } from './locator-context.js'
import { type AstNode, walk } from './parser.js'
import { tokenizeSelector } from './selector/tokenize.js'

/**
 * Note `first`/`last` are absent deliberately. `avoid-positional-access`
 * already handles them, but extracting them makes them **call sites** — the
 * score's denominator. Measured: callSites +4% to +50% depending on the repo,
 * and scores -1 to -13. That belongs with Phase 12, which owns the denominator.
 * See `avoid-positional-access.ts` for the per-repo figures.
 */
const LOCATOR_METHODS = new Set<LocatorApi>([
  'locator',
  'frameLocator',
  'getByRole',
  'getByText',
  'getByLabel',
  'getByPlaceholder',
  'getByAltText',
  'getByTitle',
  'getByTestId',
  'nth',
])

const HARD_WAIT_METHODS = new Set<string>(['waitForTimeout'])

/** APIs whose first string argument is a selector to be engine-classified. */
const SELECTOR_ARG_APIS = new Set<LocatorApi>(['locator', 'frameLocator'])

interface Position {
  line: number
  column: number
}

interface WithLoc {
  loc: { start: Position; end: Position }
  range: [number, number]
}

function propertyNode(member: AstNode): (AstNode & WithLoc) | null {
  const property = member.property as (AstNode & Partial<WithLoc>) | undefined
  if (
    property &&
    property.type === 'Identifier' &&
    typeof property.name === 'string' &&
    property.loc
  ) {
    return property as AstNode & WithLoc
  }
  return null
}

/** Reads a first argument that is a static string literal or a no-substitution template. */
function readStringArg(arg: AstNode | undefined): { value?: string; isDynamic: boolean } {
  if (!arg) {
    return { isDynamic: false }
  }
  if (arg.type === 'Literal') {
    // Only string literals carry a selector; numeric/boolean literals (e.g.
    // `.nth(2)`, `waitForTimeout(1000)`) are static but have no string value.
    if (typeof arg.value === 'string') {
      return { value: arg.value, isDynamic: false }
    }
    return { isDynamic: false }
  }
  if (arg.type === 'TemplateLiteral') {
    const expressions = arg.expressions as unknown[]
    const quasis = arg.quasis as Array<{ value: { cooked: string } }>
    if (expressions.length === 0 && quasis.length === 1) {
      return { value: quasis[0]?.value.cooked, isDynamic: false }
    }
    return { isDynamic: true }
  }
  return { isDynamic: true }
}

/** Infers the selector engine from a `locator()` string argument. */
export function inferEngine(selector: string | undefined): SelectorEngine | undefined {
  if (selector === undefined) {
    return undefined
  }
  const s = selector.trimStart()
  if (s.startsWith('xpath=') || s.startsWith('//') || s.startsWith('(//') || s.startsWith('..')) {
    return 'xpath'
  }
  if (s.startsWith('text=')) {
    return 'text'
  }
  return 'css'
}

/**
 * Extracts every recognized Playwright call-site (locators, `.nth()`, and hard
 * waits) from a parsed program. Receiver types are not analyzed — call-sites are
 * matched by method name, the pragmatic, dependency-free signal a static pass
 * can rely on. Locations point at the method name for precision in chains.
 */
export function extractLocators(code: string, program: AstNode): LocatorContext[] {
  const contexts: LocatorContext[] = []
  // `.filter({ hasText })` composes the call it is chained off, but the finding
  // lands on that call, one node up the chain — so the composition has to be
  // collected before the call sites are built. `locator('.row', { hasText })`
  // and `locator('.row').filter({ hasText })` are the same Playwright feature,
  // and a rule that abstained on one and fired on the other would be answering
  // a question about spelling.
  const composedRanges = new Map<string, NonNullable<LocatorContext['options']>>()
  walk(program, (node) => {
    if (node.type !== 'CallExpression') {
      return
    }
    const callee = node.callee as AstNode | undefined
    if (!callee || callee.type !== 'MemberExpression') {
      return
    }
    if (propertyNode(callee)?.name !== 'filter') {
      return
    }
    // Through refinements and TS wrappers: `.first().filter({ hasText })`
    // composes the `locator()` below it, and `(x as Locator).filter(…)` has a
    // range the extracted call never carries.
    const receiver = refinedBase(callee.object as AstNode | undefined) as
      | (AstNode & Partial<WithLoc>)
      | undefined
    const options = readLocatorOptions((node.arguments as AstNode[])?.[0])
    if (receiver?.range && options) {
      const key = `${receiver.range[0]}:${receiver.range[1]}`
      composedRanges.set(key, { ...composedRanges.get(key), ...options })
    }
  })

  walk(program, (node) => {
    if (node.type !== 'CallExpression') {
      return
    }
    const callee = node.callee as AstNode | undefined
    if (!callee || callee.type !== 'MemberExpression') {
      return
    }
    const property = propertyNode(callee)
    if (!property) {
      return
    }
    const name = property.name as string
    const isLocator = LOCATOR_METHODS.has(name as LocatorApi)
    const isHardWait = HARD_WAIT_METHODS.has(name)
    if (!isLocator && !isHardWait) {
      return
    }

    const apiCall = name as AnalyzedApi
    const args = (node.arguments as AstNode[]) ?? []
    const { value, isDynamic } = isLocator
      ? readStringArg(args[0])
      : { value: undefined, isDynamic: false }
    const selectorEngine = SELECTOR_ARG_APIS.has(name as LocatorApi)
      ? inferEngine(value)
      : undefined
    // Tokenized once here rather than per rule: six rules asking the same
    // question of the same string is six chances for them to disagree.
    const parsed =
      SELECTOR_ARG_APIS.has(name as LocatorApi) && value !== undefined
        ? tokenizeSelector(value)
        : undefined
    const parentApi = receiverApi(callee.object as AstNode | undefined)
    const call = node as unknown as WithLoc
    const composed = composedRanges.get(`${call.range[0]}:${call.range[1]}`)
    const own = readLocatorOptions(args[1])
    const options = own || composed ? { ...own, ...composed } : undefined

    contexts.push({
      apiCall,
      selector: value,
      selectorEngine,
      parsed,
      parentApi,
      options,
      ownOptions: own,
      isDynamic,
      raw: code.slice(call.range[0], call.range[1]),
      line: property.loc.start.line,
      column: property.loc.start.column + 1,
    })
  })

  return contexts
}

/**
 * Methods that refine an existing locator without changing where it came from.
 * `getByRole('row').filter({ hasText: 'x' }).locator('td')` is still a
 * `locator()` narrowing a `getByRole()` parent, and a rule that stopped at the
 * immediate receiver would read it as an unparented raw selector — which is
 * exactly the false positive `parentApi` exists to prevent.
 */
const REFINING_METHODS: ReadonlySet<string> = new Set(['filter', 'first', 'last', 'nth'])

/** `x as Locator`, `x!`, `(x)` — wrappers whose range is not the call's. */
function unwrap(node: AstNode | undefined): AstNode | undefined {
  let current = node
  while (
    current &&
    (current.type === 'TSAsExpression' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'TSSatisfiesExpression')
  ) {
    current = current.expression as AstNode | undefined
  }
  return current
}

/**
 * The recognized locator call a chain rests on, stepping over refinements.
 *
 * One walk, used for both questions asked of a chain — which API produced the
 * locator (`parentApi`), and which call a trailing `.filter()` composes. They
 * were written separately and disagreed: `receiverApi` walked `.first()` while
 * the filter pre-pass keyed on the immediate receiver, so
 * `locator('.row').first().filter({ hasText })` lost the composition that
 * `locator('.row').filter({ hasText })` kept — an answer about spelling, which
 * is exactly what this is here to prevent.
 */
function refinedBase(receiver: AstNode | undefined): AstNode | undefined {
  let current = unwrap(receiver)
  // Bounded by the expression's own nesting; a chain is finite.
  while (current && current.type === 'CallExpression') {
    const callee = current.callee as AstNode | undefined
    if (!callee || callee.type !== 'MemberExpression') {
      return undefined
    }
    const name = propertyNode(callee)?.name as string | undefined
    if (name === undefined) {
      return undefined
    }
    // Refining first: `nth`/`first`/`last` are recognized locator APIs *and*
    // refinements. Answering "nth" here would hide the `getByRole()` two links
    // up, which is the whole question `parentApi` is asked.
    if (!REFINING_METHODS.has(name)) {
      return LOCATOR_METHODS.has(name as LocatorApi) ? current : undefined
    }
    current = unwrap(callee.object as AstNode | undefined)
  }
  return undefined
}

/** The recognized locator method a call is chained off, if any. */
function receiverApi(receiver: AstNode | undefined): LocatorApi | undefined {
  const base = refinedBase(receiver)
  const callee = base?.callee as AstNode | undefined
  const name = callee ? (propertyNode(callee)?.name as string | undefined) : undefined
  return name !== undefined && LOCATOR_METHODS.has(name as LocatorApi)
    ? (name as LocatorApi)
    : undefined
}

/**
 * Reads which composition options a `locator()` call passed.
 *
 * Only presence is recorded: a rule needs to know that the call is composed,
 * not what it composes with. A non-literal options object yields `undefined`,
 * so a rule cannot read absence as "no options".
 */
function readLocatorOptions(arg: AstNode | undefined): LocatorContext['options'] {
  if (!arg || arg.type !== 'ObjectExpression') {
    return undefined
  }
  const options: NonNullable<LocatorContext['options']> = {}
  for (const property of (arg.properties as AstNode[]) ?? []) {
    if (property.type !== 'Property' || property.computed === true) {
      continue
    }
    const key = property.key as AstNode | undefined
    const name =
      key?.type === 'Identifier'
        ? (key.name as string)
        : key?.type === 'Literal' && typeof key.value === 'string'
          ? key.value
          : null
    if (name === 'has' || name === 'hasNot' || name === 'hasText' || name === 'hasNotText') {
      options[name] = true
    }
  }
  return Object.keys(options).length > 0 ? options : undefined
}

/**
 * True when a call site takes a selector whose *text* the analyzer never had —
 * an interpolated template literal, a variable, an `as string`. Nothing can
 * read those, so no rule ran on them at all.
 *
 * Deliberately **not** "the tokenizer abstained". A selector the tokenizer
 * declines to parse was still read as a string, and the rules that do not need
 * the parse still ran on it: `page.locator('//button >> ')` fails to tokenize
 * and is reported by `no-xpath` all the same. Counting it here produced a
 * report that printed "not enough evidence" directly above an `error` finding
 * and a `Resilience 0 F` — two opposite claims about the same run.
 *
 * Lives here rather than in `analyze` because it has to agree with what the
 * extractor decided: `isDynamic` is set in one place, and a second definition
 * of "readable" is a second answer waiting to disagree. Call sites that take no
 * selector at all (`.nth(2)`, `waitForTimeout(500)`, `getByRole(...)`) are
 * inspected by their own rules and are never counted here.
 *
 * `frameLocator('.frame')` is a known overstatement: it takes a selector, so a
 * readable one counts as inspected, yet every selector rule gates on
 * `apiCall === 'locator'` and none of them reads it. Widening the rules is the
 * fix, not narrowing the count — an exception here would hide the gap.
 */
export function isUninspected(context: LocatorContext): boolean {
  if (!SELECTOR_ARG_APIS.has(context.apiCall as LocatorApi)) {
    return false
  }
  // `selector` is set whenever a static string was found; `isDynamic` when one
  // was expected and could not be. A call with neither passed no selector at
  // all — `locator()` with a Locator argument, say — and nothing was read.
  return context.isDynamic || context.selector === undefined
}
