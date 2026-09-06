import { dirname } from 'node:path'
import {
  type AnalysisWarning,
  type ConfigDiscovery,
  ConfigError,
  type LoadConfigResult,
  type ResolvedDiscovery,
  describeRoots,
  findProjectRoot,
  formatDiscoverySource,
  loadConfig,
  resolveDiscovery,
} from '@testpilot/core'
import { ExitCode } from './exit-codes.js'
import type { GlobalOptions } from './global-options.js'

/**
 * Loads the project config for commands that operate on an existing project.
 * On a {@link ConfigError} it reports the problem and exits with code 3.
 */
export async function resolveConfigOrExit(globals: GlobalOptions): Promise<LoadConfigResult> {
  try {
    const result = await loadConfig({ cwd: globals.cwd, configPath: globals.configPath })
    if (globals.verbose && !globals.quiet) {
      const source = result.filepath ?? '(defaults — no config file found)'
      console.error(`[testpilot] config: ${source}`)
    }
    return result
  } catch (error) {
    if (error instanceof ConfigError) {
      if (!globals.quiet) {
        console.error(error.message)
      }
      process.exit(ExitCode.CONFIG)
    }
    throw error
  }
}

/**
 * Directory that config-driven discovery and reported paths are anchored at: the
 * loaded config file's directory, else the project root (nearest `package.json`).
 * `doctor` checks the same base, so it always predicts what `analyze` will do.
 */
export function resolveRootDir(cwd: string, filepath: string | null): string {
  return filepath ? dirname(filepath) : findProjectRoot(cwd)
}

export interface DiscoveryResult extends ResolvedDiscovery {
  filepath: string | null
  /** Base every reported path is relative to; encloses every scanned root. */
  rootDir: string
}

/**
 * Config + file-discovery resolution for the commands that actually select files
 * (`analyze`, `fix`). Explicit CLI patterns make `testDir`/`include` irrelevant, so
 * the Playwright fallback is skipped entirely in that case — the user already said
 * exactly what to analyze.
 */
export async function resolveDiscoveryOrExit(
  globals: GlobalOptions,
  patterns: string[],
  options: { includeHelpers?: boolean } = {},
): Promise<DiscoveryResult> {
  const loaded = await resolveConfigOrExit(globals)
  // `rootDir` is a pure function of repo layout — never of the roots discovery
  // happens to resolve. It is the baseline identity anchor: deriving it from the
  // scanned set meant adding one unrelated `projects[]` entry silently rewrote every
  // reported path and invalidated every baselined finding. Roots that fall outside
  // it produce `../` paths, which the SARIF reporter clamps at its own boundary.
  const rootDir = resolveRootDir(globals.cwd, loaded.filepath)
  const resolved = resolveDiscovery(loaded, {
    rootDir,
    disablePlaywrightFallback: patterns.length > 0 || globals.playwrightDiscovery === false,
    includeHelpers: options.includeHelpers,
  })
  const helpersRequested =
    options.includeHelpers === true || resolved.config.includeHelpers.length > 0
  if (helpersRequested && patterns.length > 0 && !globals.quiet) {
    console.error(
      '[testpilot] --with-helpers is ignored when explicit patterns are given: the patterns already say what to analyze.',
    )
  }
  announceDiscovery(globals, resolved, patterns, rootDir)
  return { ...resolved, filepath: loaded.filepath, rootDir }
}

/** The selectors actually used, across every scope — never `config.include`. */
export function effectiveSelectors(resolved: ResolvedDiscovery): {
  globs: string[]
  regexes: string[]
} {
  return {
    globs: [
      ...new Set(resolved.scopes.flatMap((scope) => [...scope.includeGlobs, ...scope.matchGlobs])),
    ],
    regexes: [
      ...new Set(
        resolved.scopes.flatMap((scope) =>
          scope.matchRegex.map((pattern) => `${pattern.source}/${pattern.flags}`),
        ),
      ),
    ],
  }
}

/**
 * One-line, human-readable account of where discovery settings came from. Names the
 * directories actually scanned and the selectors actually used — never
 * `config.testDir`/`config.include`, which a Playwright-sourced run does not use.
 */
export function describeDiscovery(resolved: ResolvedDiscovery, rootDir: string): string {
  const { discovery } = resolved
  const { globs, regexes } = effectiveSelectors(resolved)
  const selectors = [...globs, ...regexes.map((pattern) => `/${pattern}`)]
  const parts = [
    `testDir "${describeRoots(discovery.roots, rootDir)}" (${formatDiscoverySource(discovery, 'testDir')})`,
    `include ${JSON.stringify(selectors)} (${formatDiscoverySource(discovery, 'include')})`,
  ]
  if (discovery.exclude !== 'default' || resolved.scopes.some((s) => s.ignoreRegex.length > 0)) {
    parts.push(`exclude (${formatDiscoverySource(discovery, 'exclude')})`)
  }
  return `discovery: ${parts.join(', ')}`
}

/**
 * Says out loud when another tool's config decided what gets analyzed, and when one
 * was found but could not be used. A score computed over a file set chosen by
 * `playwright.config.ts` should never look like a score over a set the user chose.
 */
function announceDiscovery(
  globals: GlobalOptions,
  resolved: ResolvedDiscovery,
  patterns: string[],
  rootDir: string,
): void {
  if (globals.quiet) return
  const { discovery } = resolved
  // With explicit patterns nothing was discovered — describing a testDir that was
  // never consulted (and often does not exist) is just noise.
  if (globals.verbose && patterns.length === 0) {
    console.error(`[testpilot] ${describeDiscovery(resolved, rootDir)}`)
  }
  if (discovery.playwrightConfigPath && !globals.verbose && patterns.length === 0) {
    console.error(
      `[testpilot] Scanning ${describeRoots(discovery.roots, rootDir)} from ${discovery.playwrightConfigPath} (no testpilot.config.ts setting for testDir).`,
    )
  }
  if (discovery.playwrightConfigPartial) {
    const { path, reason } = discovery.playwrightConfigPartial
    console.error(`[testpilot] Partially read ${path}: ${reason}.`)
  }
  if (discovery.playwrightConfigIgnored) {
    const { path, reason } = discovery.playwrightConfigIgnored
    console.error(`[testpilot] Ignored ${path} for discovery: ${reason}.`)
  }
}

/**
 * The discovery problems `analyze` reports as warnings, so `fix` — the write path —
 * can carry the same signal in its own envelope.
 */
export function discoveryWarnings(discovery: ConfigDiscovery): AnalysisWarning[] {
  const warnings: AnalysisWarning[] = []
  if (discovery.playwrightConfigPartial) {
    const { path, reason } = discovery.playwrightConfigPartial
    warnings.push({
      code: 'playwright-config-partial',
      message: `${path} was used for test discovery, but part of it could not be read: ${reason}. The analyzed file set may not match what Playwright runs.`,
    })
  }
  if (discovery.playwrightConfigIgnored) {
    const { path, reason } = discovery.playwrightConfigIgnored
    warnings.push({
      code: 'playwright-config-ignored',
      message: `${path} was not used for test discovery: ${reason}.`,
    })
  }
  return warnings
}
