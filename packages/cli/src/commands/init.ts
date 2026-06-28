import { resolve } from 'node:path'
import { ScaffoldError, type ScaffoldResult, scaffoldProject } from '@testpilot/scaffold'
import type { Command } from 'commander'
import { ExitCode } from '../util/exit-codes.js'
import { type GlobalOptions, readGlobalOptions } from '../util/global-options.js'
import { resolveConfigOrExit } from '../util/resolve-config.js'

interface InitOptions {
  template?: string
  force?: boolean
}

export async function initCommand(
  directory: string | undefined,
  options: InitOptions,
  command: Command,
): Promise<void> {
  const globals = readGlobalOptions(command)
  // Load config so `ai.agents` selects which guidance files are generated.
  // An invalid config exits 3 (consistent with analyze/doctor/run).
  const { config } = await resolveConfigOrExit(globals)
  const targetDir = resolve(globals.cwd, directory ?? '.')

  try {
    const result = scaffoldProject({
      targetDir,
      templateId: options.template,
      force: options.force,
      agents: config.ai.agents,
    })
    reportInit(result, directory ?? '.', globals)
  } catch (error) {
    if (error instanceof ScaffoldError) {
      if (!globals.quiet) {
        console.error(error.message)
      }
      process.exit(ExitCode.USAGE)
    }
    throw error
  }
}

function reportInit(result: ScaffoldResult, displayDir: string, globals: GlobalOptions): void {
  if (globals.json) {
    console.log(
      JSON.stringify({
        command: 'init',
        directory: result.targetDir,
        projectName: result.projectName,
        templateId: result.templateId,
        created: result.created,
        skipped: result.skipped,
      }),
    )
    return
  }

  if (globals.quiet) {
    return
  }

  console.log(
    `Scaffolded ${result.projectName} (${result.created.length} files) using ${result.templateId}.`,
  )
  for (const file of result.created) {
    console.log(`  + ${file}`)
  }
  if (result.skipped.length > 0) {
    console.log(
      `\nSkipped ${result.skipped.length} existing file(s) — re-run with --force to overwrite:`,
    )
    for (const file of result.skipped) {
      console.log(`  · ${file}`)
    }
  }

  const cd = displayDir === '.' ? '' : `  cd ${displayDir}\n`
  console.log('\nNext steps:')
  console.log(`${cd}  npm install\n  npx playwright test     # or: npx testpilot-qa run`)
  console.log('\nThe generated project is plain Playwright — TestPilot only scaffolded it.')
}
