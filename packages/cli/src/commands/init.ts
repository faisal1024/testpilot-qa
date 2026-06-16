import { ExitCode } from '../util/exit-codes.js'

export function initCommand(): never {
  console.error('`testpilot init` is not yet implemented — coming in Milestone 3.')
  process.exit(ExitCode.NOT_IMPLEMENTED)
}
