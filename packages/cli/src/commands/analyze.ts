import { dirname, resolve } from 'node:path'
import { type Finding, buildBaseline, compareToBaseline } from '@testpilot/core'
import { analyze } from '@testpilot/locator-intelligence'
import type { Command } from 'commander'
import { BaselineError, loadBaseline, writeBaseline } from '../util/baseline-io.js'
import { ExitCode } from '../util/exit-codes.js'
import { fail } from '../util/fail.js'
import { isBelowThreshold, isValidMinScore, resolveMinScore } from '../util/gating.js'
import { type GlobalOptions, readGlobalOptions } from '../util/global-options.js'
import { toHtml } from '../util/html-report.js'
import { failNoFilesMatched } from '../util/no-files-matched.js'
import { OutputError, writeJsonFile, writeTextFile } from '../util/output.js'
import { renderAnalysisText } from '../util/render-analysis.js'
import { resolveConfigOrExit } from '../util/resolve-config.js'
import { toSarif } from '../util/sarif.js'

type ReporterFormat = 'table' | 'json' | 'sarif' | 'html'
const REPORTERS: ReporterFormat[] = ['table', 'json', 'sarif', 'html']

interface AnalyzeOptions {
  minScore?: number
  reporter?: string
  output?: string
  baseline?: string
  updateBaseline?: boolean
}

/**
 * Resolves the output format. An explicit `--reporter` always wins; otherwise
 * `--json` or a bare `--output` (which has always emitted JSON) imply `json`,
 * and interactive runs default to the human `table`.
 */
function resolveReporter(options: AnalyzeOptions, globals: GlobalOptions): ReporterFormat {
  if (options.reporter) return options.reporter as ReporterFormat
  if (globals.json || options.output) return 'json'
  return 'table'
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
  if (options.reporter && !REPORTERS.includes(options.reporter as ReporterFormat)) {
    fail(globals, `--reporter must be one of: ${REPORTERS.join(', ')}.`, ExitCode.USAGE)
  }
  if (options.updateBaseline && !options.baseline) {
    fail(globals, '--update-baseline requires --baseline <path>.', ExitCode.USAGE)
  }

  const { config, filepath } = await resolveConfigOrExit(globals)
  const report = await analyze({
    cwd: globals.cwd,
    config,
    patterns: patterns.length > 0 ? patterns : undefined,
    configDir: filepath ? dirname(filepath) : undefined,
  })
  const noFilesMatched = report.summary.filesAnalyzed === 0
  if (globals.verbose && !globals.quiet) {
    console.error(`[testpilot] files: ${report.summary.filesAnalyzed} under ${report.rootDir}`)
  }
  // An empty baseline would grandfather nothing and hide the discovery problem.
  if (noFilesMatched && options.updateBaseline) {
    failNoFilesMatched(globals, patterns, config, filepath)
  }

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
  if (options.baseline && !noFilesMatched) {
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
  // In baseline mode the SARIF annotations and the human table are scoped to the
  // *new* findings (so a brownfield PR is not flooded with pre-existing debt).
  // The JSON report is left whole — it carries the full findings plus the
  // `baseline` summary, which is its stable contract.
  const reporter = resolveReporter(options, globals)
  // Zero files is an operational failure (exit 2/3), but machine-readable consumers
  // still get the report — it carries `filesAnalyzed: 0` and the `no-files-matched`
  // warning, and an Action's `upload-sarif` with `if: always()` still finds its file.
  // The human table/HTML would just print a meaningless 100 (A), so those fail first.
  const machineReadable = reporter === 'json' || reporter === 'sarif'
  if (noFilesMatched && !machineReadable) {
    failNoFilesMatched(globals, patterns, config, filepath)
  }
  const sarifReport = newFindings === undefined ? report : { ...report, findings: newFindings }
  if (options.output) {
    try {
      if (reporter === 'sarif') {
        writeJsonFile(
          resolve(globals.cwd, options.output),
          toSarif(sarifReport, { cwd: globals.cwd }),
        )
      } else if (reporter === 'html') {
        writeTextFile(resolve(globals.cwd, options.output), toHtml(report))
      } else if (reporter === 'table') {
        writeTextFile(
          resolve(globals.cwd, options.output),
          `${renderAnalysisText(report, newFindings)}\n`,
        )
      } else {
        writeJsonFile(resolve(globals.cwd, options.output), report)
      }
    } catch (error) {
      if (error instanceof OutputError) {
        fail(globals, error.message, ExitCode.USAGE)
      }
      throw error
    }
    if (!globals.quiet) {
      console.log(`Report written to ${options.output}.`)
    }
  } else if (reporter === 'sarif') {
    console.log(JSON.stringify(toSarif(sarifReport, { cwd: globals.cwd }), null, 2))
  } else if (reporter === 'html') {
    console.log(toHtml(report))
  } else if (reporter === 'json') {
    console.log(JSON.stringify(report))
  } else if (!globals.quiet) {
    console.log(renderAnalysisText(report, newFindings))
  }

  if (noFilesMatched) {
    failNoFilesMatched(globals, patterns, config, filepath)
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
