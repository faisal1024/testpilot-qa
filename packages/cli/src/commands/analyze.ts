import { resolve } from 'node:path'
import { type Finding, buildBaseline, compareToBaseline } from '@testpilot/core'
import { analyze } from '@testpilot/locator-intelligence'
import type { Command } from 'commander'
import { BaselineError, loadBaseline, writeBaseline } from '../util/baseline-io.js'
import { ExitCode } from '../util/exit-codes.js'
import { isBelowThreshold, isValidMinScore, resolveMinScore } from '../util/gating.js'
import { type GlobalOptions, readGlobalOptions } from '../util/global-options.js'
import { OutputError, writeJsonFile } from '../util/output.js'
import { renderAnalysisText } from '../util/render-analysis.js'
import { resolveConfigOrExit } from '../util/resolve-config.js'

interface AnalyzeOptions {
  minScore?: number
  output?: string
  baseline?: string
  updateBaseline?: boolean
}

function fail(globals: GlobalOptions, message: string, code: number): never {
  if (!globals.quiet) {
    console.error(message)
  }
  process.exit(code)
}

export async function analyzeCommand(
  patterns: string[],
  options: AnalyzeOptions,
  command: Command,
): Promise<void> {
  const globals = readGlobalOptions(command)

  if (options.minScore !== undefined && !isValidMinScore(options.minScore)) {
    fail(globals, '--min-score must be a number between 0 and 100.', ExitCode.USAGE)
  }
  if (options.updateBaseline && !options.baseline) {
    fail(globals, '--update-baseline requires --baseline <path>.', ExitCode.USAGE)
  }

  const { config } = await resolveConfigOrExit(globals)
  const report = await analyze({
    cwd: globals.cwd,
    config,
    patterns: patterns.length > 0 ? patterns : undefined,
  })

  // --- Baseline ---
  let newFindings: Finding[] | undefined
  if (options.updateBaseline && options.baseline) {
    try {
      writeBaseline(resolve(globals.cwd, options.baseline), buildBaseline(report.findings))
    } catch (error) {
      if (error instanceof OutputError) {
        fail(globals, error.message, ExitCode.USAGE)
      }
      throw error
    }
    if (!globals.quiet) {
      console.log(`Baseline written to ${options.baseline} (${report.findings.length} finding(s)).`)
    }
    // Recording a baseline is not a gate.
    return
  }
  if (options.baseline) {
    let comparison: ReturnType<typeof compareToBaseline>
    try {
      const baseline = loadBaseline(resolve(globals.cwd, options.baseline), options.baseline)
      comparison = compareToBaseline(report.findings, baseline)
    } catch (error) {
      if (error instanceof BaselineError) {
        fail(globals, error.message, ExitCode.USAGE)
      }
      throw error
    }
    newFindings = comparison.newFindings
    report.baseline = {
      path: options.baseline,
      newFindings: comparison.newFindings.length,
      baselinedFindings: comparison.baselinedFindings,
    }
  }

  // --- Output ---
  if (options.output) {
    try {
      writeJsonFile(resolve(globals.cwd, options.output), report)
    } catch (error) {
      if (error instanceof OutputError) {
        fail(globals, error.message, ExitCode.USAGE)
      }
      throw error
    }
    if (!globals.quiet) {
      console.log(`Report written to ${options.output}.`)
    }
  } else if (globals.json) {
    console.log(JSON.stringify(report))
  } else if (!globals.quiet) {
    console.log(renderAnalysisText(report, newFindings))
  }

  // --- Gating ---
  const threshold = resolveMinScore(options.minScore, config.scoring.minScore)
  const scoreFailed = isBelowThreshold(report.score.score, threshold)
  const baselineFailed = newFindings !== undefined && newFindings.length > 0
  if (scoreFailed || baselineFailed) {
    if (!globals.quiet) {
      if (baselineFailed) {
        console.error(`${newFindings?.length} new finding(s) vs baseline ${options.baseline}.`)
      }
      if (scoreFailed) {
        console.error(
          `Locator Quality Score ${report.score.score} (${report.score.grade}) is below the required minimum of ${threshold}.`,
        )
      }
    }
    process.exit(ExitCode.GATE_FAILED)
  }
}
