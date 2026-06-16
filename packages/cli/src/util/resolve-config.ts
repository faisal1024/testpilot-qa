import { ConfigError, type LoadConfigResult, loadConfig } from '@testpilot/core'
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
