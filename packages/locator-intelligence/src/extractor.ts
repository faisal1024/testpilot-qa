import type { AnalyzedApi, LocatorApi, LocatorContext, SelectorEngine } from './locator-context.js'
import { type AstNode, walk } from './parser.js'
import { tokenizeSelector } from './selector/tokenize.js'

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
    const options = readLocatorOptions(args[1])

    const call = node as unknown as WithLoc
    contexts.push({
      apiCall,
      selector: value,
      selectorEngine,
      parsed,
      parentApi,
      options,
      isDynamic,
      raw: code.slice(call.range[0], call.range[1]),
      line: property.loc.start.line,
      column: property.loc.start.column + 1,
    })
  })

  return contexts
}

/**
 * The recognized locator method a call is chained off, if any.
 *
 * Note `first`/`last` are deliberately NOT in `LOCATOR_METHODS`: extracting
 * them would add them to `callSites`, which is the score's denominator, and a
 * precision PR must not move the score by enlarging the denominator — Ghost
 * went 98 -> 99 and mattermost 66 -> 69 with no quality change at all. 11e
 * adds them together with the denominator handling that has to accompany them.
 */
function receiverApi(receiver: AstNode | undefined): LocatorApi | undefined {
  if (!receiver || receiver.type !== 'CallExpression') {
    return undefined
  }
  const callee = receiver.callee as AstNode | undefined
  if (!callee || callee.type !== 'MemberExpression') {
    return undefined
  }
  const property = propertyNode(callee)
  const name = property?.name as string | undefined
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
