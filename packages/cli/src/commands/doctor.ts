import { runDoctor } from '@testpilot/core'
import type { Command } from 'commander'
import { doctorExitCode } from '../util/doctor-exit.js'
import { ExitCode } from '../util/exit-codes.js'
import { readGlobalOptions } from '../util/global-options.js'
import { renderDoctorText } from '../util/render-doctor.js'

export async function doctorCommand(_options: unknown, command: Command): Promise<void> {
  const globals = readGlobalOptions(command)

  let report: Awaited<ReturnType<typeof runDoctor>>
  try {
    report = await runDoctor({ cwd: globals.cwd, configPath: globals.configPath })
  } catch (error) {
    if (!globals.quiet) {
      console.error(
        `testpilot doctor failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    process.exit(ExitCode.INTERNAL)
  }

  if (globals.json) {
    console.log(JSON.stringify(report))
  } else if (!globals.quiet) {
    console.log(renderDoctorText(report))
  }

  process.exit(doctorExitCode(report))
}
