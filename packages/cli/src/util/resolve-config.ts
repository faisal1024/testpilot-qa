import { dirname } from 'node:path'
import { ConfigError, type LoadConfigResult, findProjectRoot, loadConfig } from '@testpilot/core'
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
