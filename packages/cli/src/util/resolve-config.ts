import { dirname } from 'node:path'
import { relative, resolve, sep } from 'node:path'
import {
  type ConfigDiscovery,
  ConfigError,
  type LoadConfigResult,
  type ResolvedDiscovery,
  type TestPilotConfig,
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
): Promise<DiscoveryResult> {
  const loaded = await resolveConfigOrExit(globals)
  const configRoot = resolveRootDir(globals.cwd, loaded.filepath)
  const resolved = resolveDiscovery(loaded, {
    rootDir: configRoot,
    disablePlaywrightFallback: patterns.length > 0 || globals.playwrightDiscovery === false,
  })
  // A Playwright `testDir` may point outside the config's directory. Reported paths
  // must stay inside `rootDir` — `../` segments make SARIF unusable to code scanning
  // — so anchor at the common ancestor of everything actually scanned.
  const rootDir = commonAncestor([configRoot, ...resolved.discovery.roots])
  announceDiscovery(globals, resolved.config, resolved.discovery, rootDir)
  return { ...resolved, filepath: loaded.filepath, rootDir }
}

/** Deepest directory containing every path given. */
function commonAncestor(paths: string[]): string {
  const split = paths.filter(Boolean).map((path) => resolve(path).split(sep))
  const first = split[0]
  if (!first) return process.cwd()
  const shared: string[] = []
  for (let i = 0; i < first.length; i += 1) {
    const segment = first[i]
    if (!split.every((parts) => parts[i] === segment)) break
    shared.push(segment as string)
  }
  return shared.join(sep) || sep
}

/**
 * One-line, human-readable account of where discovery settings came from. Names the
 * directories actually scanned, never `config.testDir` — which a Playwright-sourced
 * run does not use, and which several `projects[]` roots cannot be squeezed into.
 */
export function describeDiscovery(
  config: TestPilotConfig,
  discovery: ConfigDiscovery,
  rootDir: string,
): string {
  const scanned =
    discovery.roots.length > 0 ? describeRoots(discovery.roots, rootDir) : `${config.testDir}`
  const parts = [
    `testDir "${scanned}" (${formatDiscoverySource(discovery, 'testDir')})`,
    `include (${formatDiscoverySource(discovery, 'include')})`,
  ]
  if (discovery.exclude !== 'default') {
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
  config: TestPilotConfig,
  discovery: ConfigDiscovery,
  rootDir: string,
): void {
  if (globals.quiet) return
  if (globals.verbose) {
    console.error(`[testpilot] ${describeDiscovery(config, discovery, rootDir)}`)
  }
  if (discovery.playwrightConfigPath && !globals.verbose) {
    console.error(
      `[testpilot] Scanning ${describeRoots(discovery.roots, rootDir)} from ${discovery.playwrightConfigPath} (no testpilot.config.ts setting for testDir).`,
    )
  }
  if (discovery.playwrightConfigIgnored) {
    const { path, reason } = discovery.playwrightConfigIgnored
    const verb = discovery.playwrightConfigPath ? 'Partially read' : 'Ignored'
    console.error(`[testpilot] ${verb} ${path} for discovery: ${reason}.`)
  }
}
