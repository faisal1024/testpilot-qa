import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parse } from '@typescript-eslint/parser'

/**
 * A Playwright file selector. Playwright allows globs *or* RegExps for
 * `testMatch`/`testIgnore`, and both are matched against the **absolute** file
 * path — so both are preserved here rather than one being mistranslated into
 * the other.
 */
export type PathPattern =
  | { kind: 'glob'; value: string }
  | { kind: 'regex'; source: string; flags: string }

/**
 * One Playwright test root with the selectors that apply **to it**. Playwright
 * scopes `testMatch`/`testIgnore` per project; flattening them into a single
 * union lets one project's `testIgnore` delete another project's files.
 */
export interface PlaywrightScope {
  /** Absolute directory, resolved against the config file's own location. */
  root: string
  match: PathPattern[]
  ignore: PathPattern[]
}

export interface PlaywrightTestSettings {
  scopes: PlaywrightScope[]
}

export type PlaywrightConfigRead =
  /** Settings were read. `unresolved` names things present but not statically knowable. */
  | { status: 'ok'; settings: PlaywrightTestSettings; unresolved: string[] }
  /** The config declares no test-selection keys. Normal; nothing to report. */
  | { status: 'no-settings' }
  /** Something is there but cannot be used — the user should hear about this. */
  | { status: 'unreadable'; reason: string }

interface Node {
  type: string
  [key: string]: unknown
}

const asNode = (value: unknown): Node | null =>
  value && typeof value === 'object' && typeof (value as Node).type === 'string'
    ? (value as Node)
    : null

/** Static string value of a node, or `null` when it isn't a literal we can trust. */
function staticString(node: Node | null): string | null {
  if (!node) return null
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node.type === 'TemplateLiteral') {
    const expressions = node.expressions as unknown[] | undefined
    const quasis = node.quasis as Node[] | undefined
    if (expressions?.length === 0 && quasis?.length === 1) {
      const cooked = (quasis[0]?.value as { cooked?: string } | undefined)?.cooked
      return typeof cooked === 'string' ? cooked : null
    }
  }
  return null
}

function singlePattern(node: Node | null): PathPattern | null {
  if (!node) return null
  const literal = staticString(node)
  if (literal !== null) return { kind: 'glob', value: literal }
  const regex = node.regex as { pattern?: string; flags?: string } | undefined
  if (node.type === 'Literal' && regex?.pattern !== undefined) {
    return { kind: 'regex', source: regex.pattern, flags: regex.flags ?? '' }
  }
  return null
}

/** Reads a value that may be a single pattern or an array of them. */
function patterns(node: Node | null): PathPattern[] | null {
  if (!node) return null
  if (node.type === 'ArrayExpression') {
    const out: PathPattern[] = []
    for (const element of (node.elements as unknown[]) ?? []) {
      const one = singlePattern(asNode(element))
      if (!one) return null // one unknown element makes the whole list untrustworthy
      out.push(one)
    }
    return out.length > 0 ? out : null
  }
  const one = singlePattern(node)
  return one ? [one] : null
}

function propertyValue(object: Node, name: string): Node | null {
  for (const raw of (object.properties as unknown[]) ?? []) {
    const property = asNode(raw)
    if (!property || property.type !== 'Property') continue
    const key = asNode(property.key)
    const keyName =
      key?.type === 'Identifier' ? (key.name as string) : (staticString(key) ?? undefined)
    if (keyName === name) return asNode(property.value)
  }
  return null
}

/** True when the object mixes in another object, whose keys we cannot see. */
function hasSpread(object: Node): boolean {
  return ((object.properties as unknown[]) ?? []).some(
    (raw) => asNode(raw)?.type === 'SpreadElement',
  )
}

/** Unwraps `defineConfig({...})`, `export default config`, and `satisfies`/`as` casts. */
function resolveConfigObject(root: Node, node: Node | null, depth = 0): Node | null {
  if (!node || depth > 4) return null
  switch (node.type) {
    case 'ObjectExpression':
      return node
    case 'CallExpression':
      return resolveConfigObject(root, asNode((node.arguments as unknown[])?.[0]), depth + 1)
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
      return resolveConfigObject(root, asNode(node.expression), depth + 1)
    case 'Identifier':
      return resolveConfigObject(root, findVariableInit(root, node.name as string), depth + 1)
    default:
      return null
  }
}

/** Finds `const <name> = <init>` at any depth, so `export default config` resolves. */
function findVariableInit(root: Node, name: string): Node | null {
  let found: Node | null = null
  walk(root, (node) => {
    if (found || node.type !== 'VariableDeclarator') return
    const id = asNode(node.id)
    if (id?.type === 'Identifier' && id.name === name) {
      found = asNode(node.init)
    }
  })
  return found
}

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'range' || key === 'parent') continue
    if (Array.isArray(value)) {
      for (const item of value) {
        const child = asNode(item)
        if (child) walk(child, visit)
      }
    } else {
      const child = asNode(value)
      if (child) walk(child, visit)
    }
  }
}

/** `export default …` or CommonJS `module.exports = …` (Playwright allows `.cjs`/`.js`). */
function exportedConfigObject(root: Node): Node | null {
  let result: Node | null = null
  walk(root, (node) => {
    if (result) return
    if (node.type === 'ExportDefaultDeclaration') {
      result = resolveConfigObject(root, asNode(node.declaration))
      return
    }
    if (node.type !== 'AssignmentExpression') return
    const left = asNode(node.left)
    if (left?.type !== 'MemberExpression') return
    const object = asNode(left.object)
    const property = asNode(left.property)
    const isModuleExports =
      object?.type === 'Identifier' &&
      object.name === 'module' &&
      property?.type === 'Identifier' &&
      property.name === 'exports'
    if (isModuleExports) {
      result = resolveConfigObject(root, asNode(node.right))
    }
  })
  return result
}

interface RawSelectors {
  testDir: string | null
  match: PathPattern[] | null
  ignore: PathPattern[] | null
}

/**
 * Reads `testDir` / `testMatch` / `testIgnore` (including `projects[]`) from a
 * Playwright config **by parsing it, never by executing it**.
 *
 * TestPilot advertises itself as static and offline, and `analyze` is routinely
 * pointed at a repository the user is only evaluating. Running that repo's
 * config would let it write to stdout (corrupting `--json`), call
 * `process.exit`, hang, or mutate the process — and would fail outright in the
 * common case where `@playwright/test` isn't installed. Reading the source has
 * none of those failure modes.
 *
 * Anything not statically knowable (a computed value, a spread from another
 * object) is reported in `unresolved` rather than guessed at, so callers can
 * tell the user why their suite wasn't found.
 */
export function readPlaywrightTestSettings(configPath: string): PlaywrightConfigRead {
  let source: string
  try {
    source = readFileSync(configPath, 'utf8')
  } catch {
    return { status: 'unreadable', reason: 'file could not be read' }
  }

  let root: Node
  try {
    root = parse(source, {
      loc: false,
      range: false,
      comment: false,
      jsx: false,
    }) as unknown as Node
  } catch {
    return { status: 'unreadable', reason: 'file could not be parsed' }
  }

  const config = exportedConfigObject(root)
  if (!config) {
    return { status: 'unreadable', reason: 'its exported config is not a literal object' }
  }

  const configDir = dirname(configPath)
  const unresolved: string[] = []

  const readSelectors = (object: Node): RawSelectors => {
    if (hasSpread(object)) unresolved.push('a spread from another object')
    const result: RawSelectors = { testDir: null, match: null, ignore: null }
    const testDirNode = propertyValue(object, 'testDir')
    if (testDirNode) {
      const value = staticString(testDirNode)
      if (value === null) unresolved.push('testDir')
      else result.testDir = value
    }
    for (const [key, field] of [
      ['testMatch', 'match'],
      ['testIgnore', 'ignore'],
    ] as const) {
      const node = propertyValue(object, key)
      if (!node) continue
      const value = patterns(node)
      if (value === null) unresolved.push(key)
      else result[field] = value
    }
    return result
  }

  const base = readSelectors(config)
  const scopes: PlaywrightScope[] = []
  const declares = (raw: RawSelectors) =>
    raw.testDir !== null || raw.match !== null || raw.ignore !== null

  // Playwright resolves testDir against the config file's directory, and defaults
  // it to that directory. A project inherits any selector it doesn't set itself.
  const toScope = (raw: RawSelectors): PlaywrightScope => ({
    root: resolve(configDir, raw.testDir ?? base.testDir ?? '.'),
    match: raw.match ?? base.match ?? [],
    ignore: raw.ignore ?? base.ignore ?? [],
  })

  const projects = propertyValue(config, 'projects')
  if (projects?.type === 'ArrayExpression') {
    for (const raw of (projects.elements as unknown[]) ?? []) {
      const project = asNode(raw)
      if (project?.type !== 'ObjectExpression') continue
      const selectors = readSelectors(project)
      if (declares(selectors)) scopes.push(toScope(selectors))
    }
  }
  if (scopes.length === 0 && declares(base)) {
    scopes.push(toScope(base))
  }

  const unique = [...new Set(unresolved)]
  if (scopes.length === 0) {
    return unique.length > 0
      ? { status: 'unreadable', reason: `${unique.join(' and ')} is not a literal value` }
      : { status: 'no-settings' }
  }
  return { status: 'ok', settings: { scopes }, unresolved: unique }
}
