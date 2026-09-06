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
  /**
   * True when the config (or a project) declares a `tag` key.
   *
   * Playwright applies `testConfig.tag` to **every test in every file**, so a
   * statically-read vocabulary that ignores it is short by a tag nobody wrote
   * in a test — and `doctor` would call a correct `suites` entry a typo. We do
   * not read the values yet; knowing the key is there is enough to stop
   * claiming the vocabulary is complete.
   */
  declaresTags: boolean
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

/** The only calls whose argument is, by definition, a Playwright config. */
const CONFIG_HELPERS = new Set(['defineConfig', 'mergeConfig'])

function calleeName(node: Node | null): string | null {
  const callee = asNode(node?.callee)
  if (callee?.type === 'Identifier') return callee.name as string
  if (callee?.type === 'MemberExpression') {
    const property = asNode(callee.property)
    return property?.type === 'Identifier' ? (property.name as string) : null
  }
  return null
}

/**
 * Resolves the exported value into the **ordered** config layers it is built from.
 * `defineConfig` is variadic and merges its arguments with later ones winning, so a
 * single object is not enough: taking one layer and calling it the config drops keys
 * the others set, which silently widened the scanned root to the whole project.
 *
 * A call to anything *other* than a known Playwright helper is not unwrapped. A
 * project-local `makeConfig({...})` can rewrite what it is given, and adopting its
 * argument produced a confident score over a directory Playwright never runs.
 */
function resolveConfigLayers(
  root: Node,
  node: Node | null,
  unresolved: string[],
  depth = 0,
): Node[] {
  if (!node || depth > 4) return []
  switch (node.type) {
    case 'ObjectExpression':
      return [node]
    case 'CallExpression': {
      const name = calleeName(node)
      if (!name || !CONFIG_HELPERS.has(name)) {
        unresolved.push(`a call to ${name ? `${name}()` : 'a function'}`)
        return []
      }
      const args = (node.arguments as unknown[]) ?? []
      return args.flatMap((argument) => {
        const layers = resolveConfigLayers(root, asNode(argument), unresolved, depth + 1)
        // A layer we cannot open may be the one that sets `testDir`; saying nothing
        // would let the remaining layers pass as the whole config.
        if (layers.length === 0) unresolved.push('a config layer that could not be read')
        return layers
      })
    }
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
      return resolveConfigLayers(root, asNode(node.expression), unresolved, depth + 1)
    case 'Identifier':
      return resolveConfigLayers(
        root,
        findVariableInit(root, node.name as string),
        unresolved,
        depth + 1,
      )
    default:
      return []
  }
}

/** Finds `const <name> = <init>` at any depth, so `export default config` resolves. */
function findVariableInit(root: Node, name: string): Node | null {
  // Prefer a module-level declaration: a function-local `const config` must not
  // shadow the one actually exported.
  for (const statement of (root.body as unknown[]) ?? []) {
    const node = asNode(statement)
    const declaration =
      node?.type === 'VariableDeclaration'
        ? node
        : node?.type === 'ExportNamedDeclaration'
          ? asNode(node.declaration)
          : null
    for (const raw of (declaration?.declarations as unknown[]) ?? []) {
      const declarator = asNode(raw)
      const id = asNode(declarator?.id)
      if (id?.type === 'Identifier' && id.name === name) return asNode(declarator?.init)
    }
  }
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
function exportedConfigLayers(root: Node, unresolved: string[]): Node[] {
  let result: Node[] = []
  walk(root, (node) => {
    if (result.length > 0) return
    if (node.type === 'ExportDefaultDeclaration') {
      result = resolveConfigLayers(root, asNode(node.declaration), unresolved)
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
      result = resolveConfigLayers(root, asNode(node.right), unresolved)
    }
  })
  return result
}

interface RawSelectors {
  /** `null` = not declared (inherit); `'unresolved'` = declared but not a literal. */
  testDir: string | null | 'unresolved'
  match: PathPattern[] | null | 'unresolved'
  ignore: PathPattern[] | null | 'unresolved'
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
/** Markers that read as prose already and must not gain "is not a literal value". */
const PROSE_MARKERS = new Set([
  'a spread from another object',
  'additional defineConfig() arguments',
  'a config layer that could not be read',
])

/** "testDir is not a literal value" / "testDir and a spread from another object". */
export function describeUnresolved(keys: string[]): string {
  const values = keys.filter((key) => !PROSE_MARKERS.has(key))
  const prose = keys.filter((key) => PROSE_MARKERS.has(key))
  const parts: string[] = []
  if (values.length > 0) {
    parts.push(
      values.length === 1
        ? `${values[0]} is not a literal value`
        : `${values.join(' and ')} are not literal values`,
    )
  }
  parts.push(...prose.map((marker) => `it uses ${marker}`))
  return parts.join('; ')
}

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

  const unresolved: string[] = []
  const layers = exportedConfigLayers(root, unresolved)
  if (layers.length === 0) {
    return {
      status: 'unreadable',
      reason:
        unresolved.length > 0
          ? describeUnresolved([...new Set(unresolved)])
          : 'its exported config is not a literal object',
    }
  }

  const configDir = dirname(configPath)

  let declaresTags = false
  const readSelectors = (object: Node): RawSelectors => {
    if (hasSpread(object)) unresolved.push('a spread from another object')
    if (propertyValue(object, 'tag')) {
      declaresTags = true
    }
    const result: RawSelectors = { testDir: null, match: null, ignore: null }
    const testDirNode = propertyValue(object, 'testDir')
    if (testDirNode) {
      const value = staticString(testDirNode)
      if (value === null) {
        // Declared but unreadable. Inheriting the parent's root here would scan a
        // directory this project never selected and score it as if it had.
        unresolved.push('testDir')
        result.testDir = 'unresolved'
      } else {
        result.testDir = value
      }
    }
    for (const [key, field] of [
      ['testMatch', 'match'],
      ['testIgnore', 'ignore'],
    ] as const) {
      const node = propertyValue(object, key)
      if (!node) continue
      const value = patterns(node)
      if (value === null) {
        // Inheriting the parent's selectors here would analyze a file set this
        // project never selected — a partial false green with no total miss to catch.
        unresolved.push(key)
        result[field] = 'unresolved'
      } else {
        result[field] = value
      }
    }
    return result
  }

  /** Folds layers per key, later winning — `defineConfig`'s own merge semantics. */
  const mergeSelectors = (objects: Node[]): RawSelectors => {
    const merged: RawSelectors = { testDir: null, match: null, ignore: null }
    for (const object of objects) {
      const layer = readSelectors(object)
      if (layer.testDir !== null) merged.testDir = layer.testDir
      if (layer.match !== null) merged.match = layer.match
      if (layer.ignore !== null) merged.ignore = layer.ignore
    }
    return merged
  }

  const base = mergeSelectors(layers)
  const declares = (raw: RawSelectors) =>
    raw.testDir !== null || raw.match !== null || raw.ignore !== null

  // Playwright resolves testDir against the config file's directory, and defaults
  // it to that directory. A project inherits any selector it doesn't set itself.
  // Falling back to the config's own directory is only safe when we actually read the
  // whole config: a layer we could not open may have set `testDir`, and defaulting to
  // '.' then widens the scan to the entire project and scores files Playwright ignores.
  const rootIsKnown = unresolved.length === 0
  const toScope = (raw: RawSelectors): PlaywrightScope | null => {
    const declaredDir = raw.testDir ?? base.testDir
    if (declaredDir === null && !rootIsKnown) return null
    const testDir = declaredDir ?? '.'
    const match = raw.match ?? base.match ?? []
    const ignore = raw.ignore ?? base.ignore ?? []
    if (testDir === 'unresolved' || match === 'unresolved' || ignore === 'unresolved') {
      return null
    }
    return { root: resolve(configDir, testDir), match, ignore }
  }

  const projectSelectors: RawSelectors[] = []
  let projectsPartial = false
  const projects = layers.reduce<Node | null>(
    (found, layer) => propertyValue(layer, 'projects') ?? found,
    null,
  )
  if (projects) {
    if (projects.type !== 'ArrayExpression') {
      // `projects: makeProjects()` — we cannot see the entries at all.
      projectsPartial = true
    } else {
      for (const raw of (projects.elements as unknown[]) ?? []) {
        const project = asNode(raw)
        if (project?.type === 'ObjectExpression') projectSelectors.push(readSelectors(project))
        // A spread inside the array hides entries that may inherit the base root.
        else projectsPartial = true
      }
    }
  }
  if (projectsPartial) unresolved.push('projects')

  // **Every** project becomes a scope, not only those declaring a selector.
  // Playwright's documented auth pattern — one `setup` project with a testMatch
  // beside browser projects with none — would otherwise analyze the setup files
  // alone and report a clean score over a fraction of the suite.
  // Entries we cannot see would inherit the base root, so the base scope has to stay
  // in play — dropping it analyzed only the projects that happened to be literal.
  const useProjects =
    projectSelectors.length > 0 && (declares(base) || projectSelectors.some(declares))
  // When entries are hidden, the base scope stays in play even if the base declares
  // nothing: `testDir` then defaults to the config's own directory, which is exactly
  // what those entries inherit and what Playwright would walk.
  const candidates: RawSelectors[] = useProjects
    ? projectsPartial
      ? [base, ...projectSelectors]
      : projectSelectors
    : declares(base) || projectsPartial
      ? [base]
      : []

  const seen = new Set<string>()
  const scopes: PlaywrightScope[] = []
  for (const selectors of candidates) {
    const scope = toScope(selectors)
    if (!scope) continue
    const key = JSON.stringify([scope.root, scope.match, scope.ignore])
    if (seen.has(key)) continue
    seen.add(key)
    scopes.push(scope)
  }

  const unique = [...new Set(unresolved)]
  if (scopes.length === 0) {
    return unique.length > 0
      ? { status: 'unreadable', reason: describeUnresolved(unique) }
      : { status: 'no-settings' }
  }
  return { status: 'ok', settings: { scopes, declaresTags }, unresolved: unique }
}
