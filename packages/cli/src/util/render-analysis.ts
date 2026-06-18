import type { AnalysisReport } from '@testpilot/core'

/**
 * Renders a human-readable analysis report. Presentation only — kept in the CLI
 * so the engine stays output-agnostic. Richer reporters (table/html/sarif) are
 * a later milestone.
 */
export function renderAnalysisText(report: AnalysisReport): string {
  const { summary, findings, warnings, parseErrors } = report
  const lines: string[] = []

  for (const warning of warnings) {
    lines.push(`⚠ ${warning.message}`)
  }

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
