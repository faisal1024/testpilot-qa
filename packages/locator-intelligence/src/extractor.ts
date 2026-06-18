import type { LocatorApi, LocatorContext, SelectorEngine } from './locator-context.js'
import { type AstNode, walk } from './parser.js'

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
])

const STRING_ARG_APIS = new Set<LocatorApi>(['locator', 'frameLocator'])

interface Position {
  line: number
  column: number
}

interface NodeWithLoc extends AstNode {
  loc: { start: Position; end: Position }
  range: [number, number]
}

function isMemberExpression(node: AstNode): boolean {
  return node.type === 'MemberExpression'
}

function propertyName(member: AstNode): string | null {
  const property = member.property as AstNode | undefined
  if (property && property.type === 'Identifier' && typeof property.name === 'string') {
    return property.name
  }
  return null
}

/** Reads a first argument that is a static string literal or a no-substitution template. */
function readStringArg(arg: AstNode | undefined): { value?: string; isDynamic: boolean } {
  if (!arg) {
    return { isDynamic: false }
  }
  if (arg.type === 'Literal' && typeof arg.value === 'string') {
    return { value: arg.value, isDynamic: false }
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
 * Extracts every recognized Playwright locator call-site from a parsed program.
 * Receiver types are not analyzed — call-sites are matched by method name, which
 * is the pragmatic, dependency-free signal a static pass can rely on.
 */
export function extractLocators(code: string, program: AstNode): LocatorContext[] {
  const contexts: LocatorContext[] = []

  walk(program, (node) => {
    if (node.type !== 'CallExpression') {
      return
    }
    const callee = node.callee as AstNode | undefined
    if (!callee || !isMemberExpression(callee)) {
      return
    }
    const name = propertyName(callee)
    if (!name || !LOCATOR_METHODS.has(name as LocatorApi)) {
      return
    }

    const apiCall = name as LocatorApi
    const args = (node.arguments as AstNode[]) ?? []
    const { value, isDynamic } = readStringArg(args[0])
    const selectorEngine = STRING_ARG_APIS.has(apiCall) ? inferEngine(value) : undefined

    const withLoc = node as NodeWithLoc
    contexts.push({
      apiCall,
      selector: value,
      selectorEngine,
      isDynamic,
      raw: code.slice(withLoc.range[0], withLoc.range[1]),
      line: withLoc.loc.start.line,
      column: withLoc.loc.start.column + 1,
    })
  })

  return contexts
}
