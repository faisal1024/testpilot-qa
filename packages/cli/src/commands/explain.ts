import { explanationIds, getExplanation } from '@testpilot/locator-intelligence'
import type { Command } from 'commander'
import { ExitCode } from '../util/exit-codes.js'
import { readGlobalOptions } from '../util/global-options.js'
import { renderExplanationText } from '../util/render-explanation.js'

export function explainCommand(ruleId: string, _options: unknown, command: Command): void {
  const globals = readGlobalOptions(command)
  const explanation = getExplanation(ruleId)

  if (!explanation) {
    if (!globals.quiet) {
      console.error(`Unknown rule "${ruleId}".`)
      console.error(`Available rules: ${explanationIds().join(', ')}`)
    }
    process.exit(ExitCode.USAGE)
  }

  if (globals.json) {
    console.log(JSON.stringify(explanation))
  } else {
    console.log(renderExplanationText(explanation))
  }
}
