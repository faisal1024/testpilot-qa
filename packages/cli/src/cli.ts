#!/usr/bin/env node
import { CommanderError } from 'commander'
import { buildProgram } from './program.js'
import { ExitCode } from './util/exit-codes.js'

buildProgram()
  .parseAsync(process.argv)
  .catch((error: unknown) => {
    if (error instanceof CommanderError) {
      // `--help` and `--version` arrive here too, with exit code 0. Everything
      // else commander rejects is a usage error; commander has already printed
      // the message.
      process.exit(error.exitCode === 0 ? ExitCode.OK : ExitCode.USAGE)
    }
    // Anything else escaping a command is a bug. The documented code for that
    // is 5; an unhandled rejection exited 1, indistinguishable from a gate.
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
    process.exit(ExitCode.INTERNAL)
  })
