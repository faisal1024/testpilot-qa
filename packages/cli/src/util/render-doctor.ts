import type { CheckStatus, DoctorReport } from '@testpilot/core'

const SYMBOL: Record<CheckStatus, string> = { pass: '✓', warn: '!', fail: '✗' }

/**
 * Renders a doctor report for the terminal. Presentation only — the diagnosis
 * logic lives in @testpilot/core so it can be reused by CI and agents.
 */
export function renderDoctorText(report: DoctorReport): string {
  const lines: string[] = [`TestPilot Doctor — ${report.status.toUpperCase()}`, '']

  for (const check of report.checks) {
    lines.push(`  ${SYMBOL[check.status]} ${check.id}  ${check.message}`)
    if (check.status !== 'pass' && check.remediation) {
      lines.push(`      ↳ ${check.remediation}`)
    }
  }

  if (report.nextActions.length > 0) {
    lines.push('', 'Next actions:')
    for (const action of report.nextActions) {
      lines.push(`  - ${action}`)
    }
  }

  return lines.join('\n')
}
