import { analyze } from '@testpilot/locator-intelligence'
import type { Command } from 'commander'
import { readGlobalOptions } from '../util/global-options.js'
import { renderAnalysisText } from '../util/render-analysis.js'
import { resolveConfigOrExit } from '../util/resolve-config.js'

export async function analyzeCommand(
  patterns: string[],
  _options: unknown,
  command: Command,
): Promise<void> {
  const globals = readGlobalOptions(command)
  const { config } = await resolveConfigOrExit(globals)

  const report = await analyze({
    cwd: globals.cwd,
    config,
    patterns: patterns.length > 0 ? patterns : undefined,
  })

  if (globals.json) {
    console.log(JSON.stringify(report))
  } else if (!globals.quiet) {
    console.error(renderAnalysisText(report))
  }
  // Milestone 3B is reporting-only; score gating (--min-score) arrives in 3C.
  // Exit 0 even when findings or parse errors are present.
}
