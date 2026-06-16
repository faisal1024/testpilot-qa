import { ExitCode } from './exit-codes.js'
import type { GlobalOptions } from './global-options.js'

/** Renders the placeholder message for a not-yet-implemented command. */
export function renderNotImplemented(command: string, milestone: string, json: boolean): string {
  if (json) {
    return JSON.stringify({
      command,
      status: 'not_implemented',
      message: `\`testpilot ${command}\` is not yet implemented.`,
      plannedIn: milestone,
    })
  }
  return `\`testpilot ${command}\` is not yet implemented — coming in ${milestone}.`
}

/** Prints the placeholder message (respecting --json/--quiet) and exits. */
export function notImplemented(command: string, milestone: string, options: GlobalOptions): never {
  const output = renderNotImplemented(command, milestone, options.json)
  if (options.json) {
    console.log(output)
  } else if (!options.quiet) {
    console.error(output)
  }
  process.exit(ExitCode.NOT_IMPLEMENTED)
}
