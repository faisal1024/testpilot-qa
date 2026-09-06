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

export interface PlaywrightTestSettings {
  /** Absolute test root(s), resolved against the config file's own directory. */
  testDirs: string[]
  testMatch: PathPattern[]
  testIgnore: PathPattern[]
}

export type PlaywrightConfigRead =
  /** Settings were read. `unresolved` names keys present but not statically knowable. */
  | { status: 'ok'; settings: PlaywrightTestSettings; unresolved: string[] }
  /** The config simply declares no test-selection keys. Normal; nothing to report. */
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

function exportedConfigObject(root: Node): Node | null {
  let result: Node | null = null
  walk(root, (node) => {
    if (result || node.type !== 'ExportDefaultDeclaration') return
    result = resolveConfigObject(root, asNode(node.declaration))
  })
  return result
}

/**
 * Reads `testDir` / `testMatch` / `testIgnore` from a Playwright config **by
 * parsing it, never by executing it**.
 *
 * TestPilot advertises itself as static and offline, and `analyze` is routinely
 * pointed at a repository the user is only evaluating. Running that repo's
 * config would let it write to stdout (corrupting `--json`), call
 * `process.exit`, hang, or mutate the process — and would fail outright in the
 * common case where `@playwright/test` isn't installed. Reading the source has
 * none of those failure modes and works on exactly the configs that matter.
 *
 * `projects[]` entries are unioned with the top-level values, because real
 * suites (cal.com) declare their test roots there and nowhere else.
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
    return { status: 'unreadable', reason: 'its default export is not a literal object' }
  }

  const configDir = dirname(configPath)
  const settings: PlaywrightTestSettings = { testDirs: [], testMatch: [], testIgnore: [] }
  const unresolved: string[] = []

  const readInto = (object: Node): void => {
    const testDirNode = propertyValue(object, 'testDir')
    if (testDirNode) {
      const value = staticString(testDirNode)
      if (value === null) {
        unresolved.push('testDir')
      } else {
        // Playwright resolves testDir against its own config file's directory.
        settings.testDirs.push(resolve(configDir, value))
      }
    }
    for (const key of ['testMatch', 'testIgnore'] as const) {
      const node = propertyValue(object, key)
      if (!node) continue
      const value = patterns(node)
      if (value === null) {
        unresolved.push(key)
      } else {
        settings[key].push(...value)
      }
    }
  }

  readInto(config)
  const projects = propertyValue(config, 'projects')
  if (projects?.type === 'ArrayExpression') {
    for (const raw of (projects.elements as unknown[]) ?? []) {
      const project = asNode(raw)
      if (project?.type === 'ObjectExpression') readInto(project)
    }
  }

  const empty =
    settings.testDirs.length === 0 &&
    settings.testMatch.length === 0 &&
    settings.testIgnore.length === 0
  if (empty) {
    return unresolved.length > 0
      ? { status: 'unreadable', reason: `${unresolved.join(' and ')} is computed, not a literal` }
      : { status: 'no-settings' }
  }
  return { status: 'ok', settings, unresolved: [...new Set(unresolved)] }
}
