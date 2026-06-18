import {
  ConfigError,
  findPlaywrightConfig,
  findProjectRoot,
  loadConfig,
  resolvePlaywrightBin,
  runPlaywright,
} from '@testpilot/core'
import type { Command } from 'commander'
import { ExitCode } from '../util/exit-codes.js'
import { type GlobalOptions, readGlobalOptions } from '../util/global-options.js'

export async function runCommand(_options: unknown, command: Command): Promise<void> {
  const globals = readGlobalOptions(command)
  // Operands after the `run` command (including everything after `--`) are
  // forwarded verbatim to Playwright.
  const forwardedArgs = command.args

  const config = await loadProjectConfig(globals)

  const projectRoot = findProjectRoot(globals.cwd)
  const binPath = resolvePlaywrightBin(projectRoot)
  if (!binPath) {
    if (!globals.quiet) {
      console.error(`Playwright is not installed in ${projectRoot}.`)
      console.error('Run `npm install` first — the generated project depends on @playwright/test.')
    }
    process.exit(ExitCode.ENV)
  }

  const playwrightConfigPath = findPlaywrightConfig(projectRoot, config.playwrightConfig)

  if (!globals.quiet) {
    console.error(`[testpilot] Running Playwright in ${projectRoot}`)
    console.error(
      `[testpilot] Playwright config: ${playwrightConfigPath ?? '(Playwright default discovery)'}`,
    )
    if (forwardedArgs.length > 0) {
      console.error(`[testpilot] Forwarding to Playwright: ${forwardedArgs.join(' ')}`)
    }
  }

  const code = await runPlaywright({
    projectRoot,
    binPath,
    playwrightConfigPath,
    forwardedArgs,
  })
  process.exit(code)
}

async function loadProjectConfig(globals: GlobalOptions) {
  try {
    const result = await loadConfig({ cwd: globals.cwd, configPath: globals.configPath })
    return result.config
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
