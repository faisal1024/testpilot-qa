import { ExitCode } from '../util/exit-codes.js'

export function analyzeCommand(): never {
  console.error('`testpilot analyze` is not yet implemented — coming in Milestone 4.')
  process.exit(ExitCode.NOT_IMPLEMENTED)
}
