import { readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { findPlaywrightConfig, isDirectory } from '../project/discovery.js'
import { type ConfigDiscovery, DEFAULT_DISCOVERY } from './discovery.js'
import type { LoadConfigResult } from './load-config.js'
import {
  type PathPattern,
  describeUnresolved,
  readPlaywrightTestSettings,
} from './playwright-config.js'
import type { TestPilotConfig } from './schema.js'

/** Directories never worth scanning for a nested Playwright config. */
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'test-results',
  'playwright-report',
])

/**
 * One directory to scan, with the selectors that apply to it. Playwright scopes
 * `testMatch`/`testIgnore` per project, so these travel together — a union would
 * let one project's `testIgnore` delete another project's files.
 */
/** A Playwright RegExp selector, preserved with its flags. */
export interface RegexPattern {
  source: string
  flags: string
}

export interface DiscoveryScope {
  /** Absolute directory to scan. */
  root: string
  /** TestPilot's own globs, resolved **relative to `root`** (documented semantics). */
  includeGlobs: string[]
  /**
   * Playwright `testMatch` globs. Playwright matches these against the **absolute**
   * path, so they are applied that way and not rooted at `root` — a pattern naming a
   * segment at or above `testDir` matched nothing when it was.
   */
  matchGlobs: string[]
  /** Playwright RegExp `testMatch`, also matched against the absolute path. */
  matchRegex: RegexPattern[]
  excludeGlobs: string[]
  ignoreRegex: RegexPattern[]
}

export interface ResolvedDiscovery {
  /** The loaded config, unmodified — `scopes` is the source of truth for selection. */
  config: TestPilotConfig
  discovery: ConfigDiscovery
  /** Always at least one scope. */
  scopes: DiscoveryScope[]
}

export interface ResolveDiscoveryOptions {
  /** Directory the config file lives in (or the project root when there is none). */
  rootDir: string
  /** Set to skip the Playwright fallback entirely (`--no-playwright-discovery`). */
  disablePlaywrightFallback?: boolean
}

/**
 * Locates a Playwright config for `root`, looking one level down when the root has
 * none. Real repos keep their e2e setup in a sub-directory (immich's lives in
 * `e2e/playwright.config.ts`), and a user running `analyze` at the repo root should
 * not have to know that. Ambiguity is not resolved by guessing: if more than one
 * first-level directory has a config, none is used and the caller is told.
 */
export function findPlaywrightConfigNearby(
  root: string,
  hint?: string,
): { path: string } | { ambiguous: string[] } | null {
  const direct = findPlaywrightConfig(root, hint)
  if (direct) return { path: direct }

  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch {
    return null
  }
  const found: string[] = []
  for (const entry of entries) {
    if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue
    const child = join(root, entry)
    if (!isDirectory(child)) continue
    const resolved = findPlaywrightConfig(child)
    if (resolved) found.push(resolved)
  }
  if (found.length === 1 && found[0]) return { path: found[0] }
  return found.length > 1 ? { ambiguous: found } : null
}

/**
 * Playwright matches a pattern without a leading `**` against the absolute path,
 * so a bare `*.e2e.ts` matches at any depth. Our globs run rooted at the test
 * directory, so the same pattern would only match the top level — prefix it.
 * Patterns that reach outside the root are left alone (they cannot be anchored).
 */
function normalizeAdoptedGlob(pattern: string): string {
  const cleaned = pattern.replace(/^\.\//, '')
  if (cleaned.startsWith('**') || cleaned.startsWith('..') || cleaned.startsWith('/')) {
    return cleaned
  }
  return `**/${cleaned}`
}

function splitPatterns(patterns: PathPattern[]): { globs: string[]; regexes: RegexPattern[] } {
  const globs: string[] = []
  const regexes: RegexPattern[] = []
  for (const pattern of patterns) {
    if (pattern.kind === 'glob') globs.push(normalizeAdoptedGlob(pattern.value))
    else regexes.push({ source: pattern.source, flags: pattern.flags })
  }
  return { globs, regexes }
}

/** The scope implied by the TestPilot config alone. */
function ownScope(config: TestPilotConfig, rootDir: string): DiscoveryScope {
  return {
    root: resolve(rootDir, config.testDir),
    includeGlobs: config.include,
    matchGlobs: [],
    matchRegex: [],
    excludeGlobs: config.exclude,
    ignoreRegex: [],
  }
}

/**
 * Resolves which files TestPilot should analyze, falling back to the project's
 * Playwright config for anything the user did not set in `testpilot.config.ts`.
 *
 * This is a **separate, explicit step** rather than part of `loadConfig`: only
 * `analyze`, `fix`, and `doctor` need discovery, and only they should pay for
 * reading another tool's config. `init` and `run` load config without it.
 *
 * `testDir` and `testMatch` are adopted **as a pair**. Taking Playwright's
 * `testMatch` while keeping TestPilot's `testDir` produces a selection neither
 * tool would make, and silently emptied the file set for projects scaffolded by
 * `testpilot init` (which sets `testDir` and not `include`).
 */
export function resolveDiscovery(
  loaded: LoadConfigResult,
  options: ResolveDiscoveryOptions,
): ResolvedDiscovery {
  const config = loaded.config
  const discovery: ConfigDiscovery = {
    ...DEFAULT_DISCOVERY,
    testDir: loaded.explicitKeys.has('testDir') ? 'testpilot-config' : 'default',
    include: loaded.explicitKeys.has('include') ? 'testpilot-config' : 'default',
    exclude: loaded.explicitKeys.has('exclude') ? 'testpilot-config' : 'default',
  }
  const own = ownScope(config, options.rootDir)
  const withoutFallback = (): ResolvedDiscovery => {
    discovery.roots = [own.root]
    return { config, discovery, scopes: [own] }
  }

  // Adoption is all-or-nothing on `testDir`, so an explicit one ends it here —
  // reading a config we could never use would only produce misleading warnings.
  if (options.disablePlaywrightFallback === true || discovery.testDir !== 'default') {
    return withoutFallback()
  }

  const located = findPlaywrightConfigNearby(options.rootDir, config.playwrightConfig)
  if (!located) return withoutFallback()
  if ('ambiguous' in located) {
    discovery.playwrightConfigIgnored = {
      path: located.ambiguous.join(', '),
      reason: 'several sub-directories declare a Playwright config, so none was assumed',
    }
    return withoutFallback()
  }

  const configPath = located.path
  const read = readPlaywrightTestSettings(configPath)
  if (read.status === 'no-settings') {
    // Playwright's `testDir` defaults to the config file's own directory. For a config
    // kept in a sub-directory that IS the suite location, and ignoring it silently sent
    // us back to `tests/` — scoring whatever happened to be there.
    const configDir = dirname(configPath)
    if (configDir !== resolve(options.rootDir)) {
      discovery.testDir = 'playwright-config'
      discovery.roots = [configDir]
      discovery.playwrightConfigPath = configPath
      return {
        config,
        discovery,
        scopes: [{ ...ownScope(config, options.rootDir), root: configDir }],
      }
    }
    return withoutFallback()
  }
  if (read.status === 'unreadable') {
    discovery.playwrightConfigIgnored = { path: configPath, reason: read.reason }
    return withoutFallback()
  }

  const scopes: DiscoveryScope[] = []
  // An explicit setting is the user's choice and outranks Playwright's, consistently
  // for `testDir`, `include`, and `exclude` alike.
  const includeIsOurs = discovery.include === 'default'
  const excludeIsOurs = discovery.exclude === 'default'
  let adoptedInclude = false
  let adoptedIgnore = false
  const seen = new Set<string>()
  for (const scope of read.settings.scopes) {
    const match = splitPatterns(scope.match)
    const ignore = excludeIsOurs ? splitPatterns(scope.ignore) : { globs: [], regexes: [] }
    const takeMatch = includeIsOurs && (match.globs.length > 0 || match.regexes.length > 0)
    if (takeMatch) adoptedInclude = true
    if (ignore.globs.length > 0 || ignore.regexes.length > 0) adoptedIgnore = true
    const next: DiscoveryScope = {
      root: scope.root,
      // Our own globs still apply when Playwright selects purely by RegExp, so a
      // scope always has a selector and `config.include` never has to be emptied.
      includeGlobs: takeMatch ? [] : config.include,
      matchGlobs: takeMatch ? match.globs : [],
      matchRegex: takeMatch ? match.regexes : [],
      excludeGlobs: [...config.exclude, ...ignore.globs],
      ignoreRegex: ignore.regexes,
    }
    // Identical scopes would each trigger their own glob pass over the same tree.
    const key = JSON.stringify(next)
    if (seen.has(key)) continue
    seen.add(key)
    scopes.push(next)
  }

  discovery.testDir = 'playwright-config'
  discovery.roots = [...new Set(scopes.map((scope) => scope.root))]
  discovery.playwrightConfigPath = configPath
  if (adoptedInclude) {
    // Some scopes may still use our own globs (Playwright declared none for them).
    discovery.include = scopes.some((scope) => scope.includeGlobs.length > 0)
      ? 'mixed'
      : 'playwright-config'
  }
  if (adoptedIgnore) discovery.exclude = 'playwright-config'
  if (read.unresolved.length > 0) {
    // The config *was* used — saying it "was not used" would send the user to fix a
    // problem they don't have.
    discovery.playwrightConfigPartial = {
      path: configPath,
      reason: describeUnresolved(read.unresolved),
    }
  }
  return { config, discovery, scopes }
}

/** Renders scanned roots relative to `rootDir` for messages. */
export function describeRoots(roots: string[], rootDir: string): string {
  if (roots.length === 0) return '(none)'
  return roots.map((root) => relative(rootDir, root) || '.').join(', ')
}
