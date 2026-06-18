import type { AnalysisReport, ScoreBreakdown } from '@testpilot/core'

function scoreLine(label: string, breakdown: ScoreBreakdown): string {
  return `  ${label.padEnd(16)}${String(breakdown.score).padStart(3)}  ${breakdown.grade}`
}

/**
 * Renders a human-readable analysis report. Presentation only — kept in the CLI
 * so the engine stays output-agnostic. Richer reporters (table/html/sarif) are
 * a later milestone.
 */
export function renderAnalysisText(report: AnalysisReport): string {
  const { summary, score, findings, warnings, parseErrors } = report
  const lines: string[] = []

  for (const warning of warnings) {
    lines.push(`⚠ ${warning.message}`)
  }

  lines.push(
    `Locator Quality Score: ${score.score} (${score.grade})  [${score.callSites} call-site(s)]`,
  )
  lines.push(scoreLine('Resilience', score.subScores.resilience))
  lines.push(scoreLine('Accessibility', score.subScores.accessibility))
  lines.push(scoreLine('Maintainability', score.subScores.maintainability))
  lines.push(scoreLine('Flakiness', score.subScores.flakiness))
  lines.push('')

  if (findings.length === 0) {
    lines.push(`No locator issues found across ${summary.filesAnalyzed} file(s).`)
  } else {
    for (const finding of findings) {
      const location = `${finding.file}:${finding.line}:${finding.column}`
      lines.push(
        `  ${location}  ${finding.severity.toUpperCase()}  ${finding.ruleId}  ${finding.message}`,
      )
    }
    const { error, warn, info } = summary.bySeverity
    lines.push('')
    lines.push(
      `${summary.findings} finding(s) in ${summary.filesAnalyzed} file(s) — ` +
        `${error} error, ${warn} warn, ${info} info.`,
    )
  }

  if (parseErrors.length > 0) {
    lines.push('')
    lines.push(`Could not parse ${parseErrors.length} file(s):`)
    for (const parseError of parseErrors) {
      lines.push(`  ${parseError.file}`)
    }
  }

  return lines.join('\n')
}
