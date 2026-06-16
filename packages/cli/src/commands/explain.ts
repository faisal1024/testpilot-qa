import { ExitCode } from '../util/exit-codes.js'

export function explainCommand(ruleId: string): never {
  console.error(`\`testpilot explain ${ruleId}\` is not yet implemented — coming in Phase 4.`)
  process.exit(ExitCode.NOT_IMPLEMENTED)
}
