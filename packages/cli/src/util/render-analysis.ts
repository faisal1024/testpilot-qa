import type { AnalysisReport } from '@testpilot/core'

/**
 * Renders a human-readable analysis report. Presentation only — kept in the CLI
 * so the engine stays output-agnostic. Richer reporters (table/html/sarif) are
 * a later milestone.
 */
export function renderAnalysisText(report: AnalysisReport): string {
  const { summary, findings } = report

  if (findings.length === 0) {
    return `No locator issues found across ${summary.filesAnalyzed} file(s).`
  }

  const lines = findings.map((finding) => {
    const location = `${finding.file}:${finding.line}:${finding.column}`
    return `  ${location}  ${finding.severity.toUpperCase()}  ${finding.ruleId}  ${finding.message}`
  })

  const { error, warn, info } = summary.bySeverity
  lines.push('')
  lines.push(
    `${summary.findings} finding(s) in ${summary.filesAnalyzed} file(s) — ` +
      `${error} error, ${warn} warn, ${info} info.`,
  )
  return lines.join('\n')
}
