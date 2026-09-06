import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { findPlaywrightConfig, isDirectory } from '../project/discovery.js'
import { type ConfigDiscovery, DEFAULT_DISCOVERY, DEFAULT_HELPER_PATTERNS } from './discovery.js'
import type { LoadConfigResult } from './load-config.js'
import {
  type PathPattern,
  describeUnresolved,
  mayDeclareTags,
  readPlaywrightTestSettings,
} from './playwright-config.js'
import type { TestPilotConfig } from './schema.js'

/** The schema default; a user-set value is an explicit choice worth reporting on. */
const DEFAULT_PLAYWRIGHT_CONFIG = 'playwright.config.ts'

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
  /** TestPilot's own `exclude`, applied as a root-relative glob ignore. */
  excludeGlobs: string[]
  /**
   * Page-object / fixture / helper globs, matched against the absolute path. These
   * files are not tests — Playwright never runs them — so findings from them are
   * tagged `inHelper` and can be read separately from the suite's own.
   */
  helperGlobs: string[]
  /**
   * Where to look for those files. Helpers sit *beside* the test root far more often
   * than inside it (Ghost's live in `e2e/helpers` while its tests are in `e2e/tests`),
   * so scanning from `root` would find nothing.
   */
  helperRoot: string
  /** Playwright `testIgnore` globs — absolute-path matchers, like `matchGlobs`. */
  ignoreGlobs: string[]
  /** Playwright RegExp `testIgnore`. */
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
  /** `--with-helpers`: analyze page objects and fixtures alongside the tests. */
  includeHelpers?: boolean
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
  hintIsExplicit = false,
): { path: string } | { ambiguous: string[] } | null {
  // An explicit hint is a user choice — even when it happens to equal the schema
  // default. If it does not resolve, silently reading a *different* config would
  // score the wrong tree with no way to notice.
  if (hint && hintIsExplicit) {
    const hinted = resolve(root, hint)
    return existsSync(hinted) ? { path: hinted } : null
  }
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
  // Playwright's rule verbatim: anything not already anchored with `**/` gets it.
  return cleaned.startsWith('**/') ? cleaned : `**/${cleaned}`
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

/** Cheap evidence that a directory is a test suite: any file with a test-ish suffix. */
const TEST_FILE_SEARCH_DEPTH = 8

function holdsTestFiles(dir: string): boolean {
  const TEST_FILE = /\.(spec|test|e2e|e2e-spec|setup)\.[cm]?[jt]sx?$/
  const walk = (current: string, depth: number): boolean => {
    if (depth > TEST_FILE_SEARCH_DEPTH) return false
    let entries: string[]
    try {
      entries = readdirSync(current)
    } catch {
      return false
    }
    for (const entry of entries) {
      if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue
      const child = join(current, entry)
      if (isDirectory(child)) {
        if (walk(child, depth + 1)) return true
      } else if (TEST_FILE.test(entry)) {
        return true
      }
    }
    return false
  }
  return walk(dir, 0)
}

/** The scope implied by the TestPilot config alone. */
function ownScope(config: TestPilotConfig, rootDir: string, helperGlobs: string[]): DiscoveryScope {
  return {
    helperRoot: resolve(rootDir),
    root: resolve(rootDir, config.testDir),
    includeGlobs: config.include,
    matchGlobs: [],
    matchRegex: [],
    excludeGlobs: config.exclude,
    helperGlobs,
    ignoreGlobs: [],
    ignoreRegex: [],
  }
}

/**
 * The helper patterns in force: what the project named, else the conventional set when
 * `--with-helpers` asked for them, else none.
 */
function helperPatterns(config: TestPilotConfig, requested: boolean): string[] {
  if (config.includeHelpers.length > 0) return config.includeHelpers
  return requested ? DEFAULT_HELPER_PATTERNS : []
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
/**
 * Whether the Playwright config this project actually runs under declares a
 * config-level `tag` — or might, in a region we could not read.
 *
 * Deliberately independent of whether that config's `testDir` was adopted:
 * `testConfig.tag` applies to every test in every file either way.
 *
 * Resolved with `findPlaywrightConfig`, the *same* call `testpilot run` makes
 * (`run.ts`), rather than the nearby-search discovery uses. That is the whole
 * point: the question is "what will Playwright be given when this suite runs",
 * so the answer has to come from the same lookup. Filtering the nearby search
 * by directory instead looked equivalent and was not — it swallowed an explicit
 * `playwrightConfig` hint pointing at a sub-directory, which `run` honours.
 */
function declaresTagsIn(rootDir: string, hint: string): boolean {
  const path = findPlaywrightConfig(rootDir, hint)
  if (!path) {
    return false
  }
  // `mayDeclareTags`, not `declaresTags`: a key hidden behind a spread or an
  // unparseable layer is "unknown", and for a vocabulary unknown must widen.
  return mayDeclareTags(readPlaywrightTestSettings(path))
}

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
  const helperGlobs = helperPatterns(config, options.includeHelpers === true)
  const own = ownScope(config, options.rootDir, helperGlobs)
  const withoutFallback = (): ResolvedDiscovery => {
    discovery.roots = [own.root]
    return { config, discovery, scopes: [own] }
  }

  // Adoption is all-or-nothing on `testDir`, so an explicit one ends it here —
  // reading a config we could never use would only produce misleading warnings.
  // One thing is still read: a config-level `tag`, which Playwright applies to
  // every test in every file whatever `testDir` we use. `testpilot init` writes
  // an explicit `testDir`, so this is the default shape of a TestPilot project,
  // and missing it made `tags` count the wrong set and `doctor` call a correct
  // suite a typo.
  if (options.disablePlaywrightFallback === true || discovery.testDir !== 'default') {
    discovery.playwrightConfigDeclaresTags = declaresTagsIn(
      options.rootDir,
      config.playwrightConfig,
    )
    return withoutFallback()
  }

  const located = findPlaywrightConfigNearby(
    options.rootDir,
    config.playwrightConfig,
    loaded.explicitKeys.has('playwrightConfig'),
  )
  if (!located) {
    if (loaded.explicitKeys.has('playwrightConfig')) {
      discovery.playwrightConfigIgnored = {
        path: resolve(options.rootDir, config.playwrightConfig),
        reason: 'playwrightConfig points at a file that does not exist',
      }
    }
    return withoutFallback()
  }
  if ('ambiguous' in located) {
    discovery.playwrightConfigIgnored = {
      path: located.ambiguous.join(', '),
      reason: 'several sub-directories declare a Playwright config, so none was assumed',
    }
    discovery.playwrightConfigDeclaresTags = declaresTagsIn(
      options.rootDir,
      config.playwrightConfig,
    )
    return withoutFallback()
  }

  const configPath = located.path
  const read = readPlaywrightTestSettings(configPath)
  // Set before any branch returns: a `tag` key applies to every test whether or
  // not the config also yielded scopes we could use.
  discovery.playwrightConfigDeclaresTags = mayDeclareTags(read)
  if (read.status === 'no-settings') {
    // Playwright's `testDir` defaults to the config file's own directory, so a config
    // kept in a sub-directory usually IS the suite location — ignoring that sent us
    // back to `tests/`, scoring whatever happened to be there. But an `examples/` or
    // `docs/` config would then hijack discovery, so adopt only a directory that
    // demonstrably holds tests, and never stay silent either way.
    const configDir = dirname(configPath)
    if (configDir !== resolve(options.rootDir) && holdsTestFiles(configDir)) {
      discovery.testDir = 'playwright-config'
      discovery.roots = [configDir]
      discovery.playwrightConfigPath = configPath
      return {
        config,
        discovery,
        scopes: [{ ...ownScope(config, options.rootDir, helperGlobs), root: configDir }],
      }
    }
    discovery.playwrightConfigIgnored = {
      path: configPath,
      reason:
        configDir === resolve(options.rootDir)
          ? 'it declares no testDir, so Playwright would scan the whole project root'
          : `it declares no testDir and no test files were found within ${TEST_FILE_SEARCH_DEPTH} directory levels of it`,
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
    // `exclude` and `testIgnore` are not competing definitions of one thing — a user
    // adding one exclusion never means "and run the slow suite". Both always apply.
    const ignore = splitPatterns(scope.ignore)
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
      excludeGlobs: config.exclude,
      helperGlobs,
      // The Playwright config's own directory: the suite's helper layer lives under it.
      helperRoot: dirname(configPath),
      ignoreGlobs: ignore.globs,
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
  if (adoptedIgnore) discovery.exclude = excludeIsOurs ? 'playwright-config' : 'mixed'
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
