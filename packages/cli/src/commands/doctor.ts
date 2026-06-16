import { ExitCode } from '../util/exit-codes.js'

export function doctorCommand(): never {
  console.error('`testpilot doctor` is not yet implemented — coming in Phase 4.')
  process.exit(ExitCode.NOT_IMPLEMENTED)
}
