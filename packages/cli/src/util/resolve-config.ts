import { dirname } from 'node:path'
import {
  type ConfigDiscovery,
  ConfigError,
  type LoadConfigResult,
  type ResolvedDiscovery,
  type TestPilotConfig,
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
  const rootDir = resolveRootDir(globals.cwd, loaded.filepath)
  const resolved = resolveDiscovery(loaded, {
    rootDir,
    disablePlaywrightFallback: patterns.length > 0 || globals.playwrightDiscovery === false,
  })
  announceDiscovery(globals, resolved.config, resolved.discovery)
  return { ...resolved, filepath: loaded.filepath, rootDir }
}

/** One-line, human-readable account of where discovery settings came from. */
export function describeDiscovery(config: TestPilotConfig, discovery: ConfigDiscovery): string {
  const parts = [
    `testDir "${config.testDir}" (${formatDiscoverySource(discovery, 'testDir')})`,
    `include ${JSON.stringify(config.include)} (${formatDiscoverySource(discovery, 'include')})`,
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
): void {
  if (globals.quiet) return
  if (globals.verbose) {
    console.error(`[testpilot] ${describeDiscovery(config, discovery)}`)
  }
  if (discovery.playwrightConfigPath && !globals.verbose) {
    console.error(
      `[testpilot] Using testDir/include from ${discovery.playwrightConfigPath} (no testpilot.config.ts setting for them).`,
    )
  }
  if (discovery.playwrightConfigIgnored) {
    const { path, reason } = discovery.playwrightConfigIgnored
    console.error(`[testpilot] Ignored ${path} for discovery: ${reason}.`)
  }
}
