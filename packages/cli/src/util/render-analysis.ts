import type { AnalysisReport, Finding, ScoreBreakdown } from '@testpilot/core'

function scoreLine(label: string, breakdown: ScoreBreakdown): string {
  return `  ${label.padEnd(16)}${String(breakdown.score).padStart(3)}  ${breakdown.grade}`
}

function findingLine(finding: Finding): string {
  const location = `${finding.file}:${finding.line}:${finding.column}`
  // A page object centralizing a selector is doing its job; a test doing it is not.
  // The reader needs to know which one they are looking at.
  const scope = finding.inHelper ? ' [helper]' : ''
  return `  ${location}${scope}  ${finding.severity.toUpperCase()}  ${finding.ruleId}  ${finding.message}`
}

/**
 * Renders a human-readable analysis report. Presentation only — kept in the CLI
 * so the engine stays output-agnostic. When `newFindings` is given (baseline
 * mode), only the regressions over the baseline are listed.
 */
export function renderAnalysisText(report: AnalysisReport, newFindings?: Finding[]): string {
  const { summary, score, findings, warnings, parseErrors, baseline } = report
  const lines: string[] = []

  // The success path needs disclosure too: a wrong-but-unflagged adoption is
  // invisible if we only speak up when something went wrong.
  if (report.discovery?.playwrightConfigPath) {
    lines.push(
      `Scanned ${report.discovery.roots.join(', ')} (from ${report.discovery.playwrightConfigPath})`,
    )
  }
  for (const warning of warnings) {
    lines.push(`⚠ ${warning.message}`)
  }

  if (summary.helperFiles) {
    lines.push(
      `Including ${summary.helperFiles} page object/helper file(s), marked [helper] — Playwright's testMatch does not select these as test files.`,
    )
  }
  lines.push(
    score.score === null
      ? `Locator Quality Score: not enough evidence  [${score.callSites} call-site(s), none inspectable]`
      : `Locator Quality Score: ${score.score} (${score.grade})  [${score.callSites} call-site(s)]`,
  )
  lines.push(scoreLine('Resilience', score.subScores.resilience))
  lines.push(scoreLine('Accessibility', score.subScores.accessibility))
  lines.push(scoreLine('Maintainability', score.subScores.maintainability))
  lines.push(scoreLine('Flakiness', score.subScores.flakiness))
  lines.push('')

  const previousIdNote = baseline?.matchedByPreviousId
    ? [
        `  ${baseline.matchedByPreviousId} of them matched under a rule's previous id — that rule was split or renamed since this baseline was recorded. Re-record it to keep the file current.`,
      ]
    : []

  if (baseline && newFindings) {
    // Baseline mode: show only regressions over the baseline.
    if (newFindings.length === 0) {
      lines.push(
        `No new findings vs baseline (${baseline.baselinedFindings} baselined) across ${summary.filesAnalyzed} file(s).`,
      )
      lines.push(...previousIdNote)
    } else {
      for (const finding of newFindings) {
        lines.push(findingLine(finding))
      }
      lines.push('')
      lines.push(
        `${newFindings.length} new finding(s) vs baseline ${baseline.path} ` +
          `(${baseline.baselinedFindings} baselined) across ${summary.filesAnalyzed} file(s).`,
      )
      lines.push(...previousIdNote)
    }
  } else if (findings.length === 0) {
    lines.push(`No locator issues found across ${summary.filesAnalyzed} file(s).`)
  } else {
    for (const finding of findings) {
      lines.push(findingLine(finding))
    }
    const { error, warn, info } = summary.bySeverity
    lines.push('')
    lines.push(
      `${summary.findings} finding(s) in ${summary.filesAnalyzed} file(s) — ` +
        `${error} error, ${warn} warn, ${info} info.`,
    )
  }
  // Outside the branches: the score card is printed in every mode, so the note
  // that some findings are missing from it has to be too. Putting it in the
  // default branch only left `--baseline` runs — the CI mode — silent.
  lines.push(...unscoredNote(summary))

  if (parseErrors.length > 0) {
    lines.push('')
    lines.push(`Could not parse ${parseErrors.length} file(s):`)
    for (const parseError of parseErrors) {
      lines.push(`  ${parseError.file}`)
    }
  }

  return lines.join('\n')
}

/**
 * Names findings that were counted but kept out of the score.
 *
 * The JSON carries `unscoredFindings`, but the table is what a human reads and
 * the HTML report is what gets shared — a silent adjustment in either is the
 * failure this project spent Phase 9 removing.
 */
function unscoredNote(summary: AnalysisReport['summary']): string[] {
  const unscored = summary.unscoredFindings ?? 0
  if (unscored === 0) {
    return []
  }
  const rules = summary.unscoredRuleIds ?? []
  return [
    // Not "of those": the note now prints in baseline mode too, where the
    // preceding line counts *new* findings and "those" would name the wrong set.
    `  ${unscored} finding(s)${rules.length > 0 ? ` from ${rules.join(', ')}` : ''} are not scored — measured per test, while the score is per locator call-site.`,
  ]
}
