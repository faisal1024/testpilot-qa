import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { findPlaywrightConfig, isDirectory } from '../project/discovery.js'
import { type ConfigDiscovery, DEFAULT_DISCOVERY } from './discovery.js'
import type { LoadConfigResult } from './load-config.js'
import { type PathPattern, readPlaywrightTestSettings } from './playwright-config.js'
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

export interface ResolvedDiscovery {
  /** The config with any adopted `testDir` / `include` / `exclude` applied. */
  config: TestPilotConfig
  discovery: ConfigDiscovery
  /** Absolute test roots. Playwright suites can declare several via `projects[]`. */
  roots: string[]
  /** Playwright RegExp `testMatch` sources, applied to absolute paths as Playwright does. */
  matchRegex: string[]
  /** Playwright RegExp `testIgnore` sources. */
  ignoreRegex: string[]
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
 * first-level directory has a config, none is used.
 */
export function findPlaywrightConfigNearby(root: string, hint?: string): string | null {
  const direct = findPlaywrightConfig(root, hint)
  if (direct) return direct

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
  return found.length === 1 ? (found[0] ?? null) : null
}

/**
 * Playwright matches a pattern without a leading `**` against the absolute path,
 * so a bare `*.e2e.ts` matches at any depth. Our globs run rooted at the test
 * directory, so the same pattern would only match the top level — prefix it.
 */
function normalizeAdoptedGlob(pattern: string): string {
  const cleaned = pattern.replace(/^\.\//, '')
  return cleaned.startsWith('**') ? cleaned : `**/${cleaned}`
}

function splitPatterns(patterns: PathPattern[]): { globs: string[]; regexes: string[] } {
  const globs: string[] = []
  const regexes: string[] = []
  for (const pattern of patterns) {
    if (pattern.kind === 'glob') globs.push(normalizeAdoptedGlob(pattern.value))
    else regexes.push(pattern.source)
  }
  return { globs, regexes }
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
  const config = { ...loaded.config }
  const discovery: ConfigDiscovery = {
    ...DEFAULT_DISCOVERY,
    testDir: loaded.explicitKeys.has('testDir') ? 'testpilot-config' : 'default',
    include: loaded.explicitKeys.has('include') ? 'testpilot-config' : 'default',
    exclude: loaded.explicitKeys.has('exclude') ? 'testpilot-config' : 'default',
  }
  const fallback: ResolvedDiscovery = {
    config,
    discovery,
    roots: [],
    matchRegex: [],
    ignoreRegex: [],
  }

  // Nothing left to fill, or the user opted out.
  if (
    options.disablePlaywrightFallback === true ||
    (discovery.testDir !== 'default' && discovery.include !== 'default')
  ) {
    return fallback
  }

  const configPath = findPlaywrightConfigNearby(options.rootDir, config.playwrightConfig)
  if (!configPath) return fallback

  const read = readPlaywrightTestSettings(configPath)
  if (read.status === 'no-settings') {
    // A Playwright config that simply doesn't set testDir/testMatch is unremarkable.
    return fallback
  }
  if (read.status === 'unreadable') {
    discovery.playwrightConfigIgnored = { path: configPath, reason: read.reason }
    return fallback
  }

  const { settings, unresolved } = read
  const match = splitPatterns(settings.testMatch)
  const ignore = splitPatterns(settings.testIgnore)
  let adopted = false

  // testDir + testMatch move together (see the docstring).
  if (discovery.testDir === 'default' && settings.testDirs.length > 0) {
    fallback.roots = [...new Set(settings.testDirs)]
    discovery.testDir = 'playwright-config'
    adopted = true
    if (discovery.include === 'default' && (match.globs.length > 0 || match.regexes.length > 0)) {
      config.include = match.globs
      fallback.matchRegex = match.regexes
      discovery.include = 'playwright-config'
    }
  }

  if (adopted && (ignore.globs.length > 0 || ignore.regexes.length > 0)) {
    config.exclude = [...config.exclude, ...ignore.globs]
    fallback.ignoreRegex = ignore.regexes
    if (ignore.globs.length > 0) discovery.exclude = 'playwright-config'
  }

  if (adopted) {
    discovery.playwrightConfigPath = configPath
    if (unresolved.length > 0) {
      discovery.playwrightConfigIgnored = {
        path: configPath,
        reason: `${unresolved.join(' and ')} is computed, not a literal`,
      }
    }
  } else if (unresolved.length > 0) {
    discovery.playwrightConfigIgnored = {
      path: configPath,
      reason: `${unresolved.join(' and ')} is computed, not a literal`,
    }
  }
  fallback.config = config
  return fallback
}
