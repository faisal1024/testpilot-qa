import { analyze } from '@testpilot/locator-intelligence'
import type { Command } from 'commander'
import { ExitCode } from '../util/exit-codes.js'
import { isBelowThreshold, resolveMinScore } from '../util/gating.js'
import { readGlobalOptions } from '../util/global-options.js'
import { renderAnalysisText } from '../util/render-analysis.js'
import { resolveConfigOrExit } from '../util/resolve-config.js'

interface AnalyzeOptions {
  minScore?: number
}

export async function analyzeCommand(
  patterns: string[],
  options: AnalyzeOptions,
  command: Command,
): Promise<void> {
  const globals = readGlobalOptions(command)

  if (options.minScore !== undefined && Number.isNaN(options.minScore)) {
    if (!globals.quiet) {
      console.error('--min-score must be a number between 0 and 100.')
    }
    process.exit(ExitCode.USAGE)
  }

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

  // Gating: --min-score flag wins, else config.scoring.minScore, else no gate.
  const threshold = resolveMinScore(options.minScore, config.scoring.minScore)
  if (isBelowThreshold(report.score.score, threshold)) {
    if (!globals.quiet) {
      console.error(
        `Locator Quality Score ${report.score.score} (${report.score.grade}) is below the required minimum of ${threshold}.`,
      )
    }
    process.exit(ExitCode.GATE_FAILED)
  }
  // Reporting-only otherwise: exit 0 even with findings or parse errors.
}
