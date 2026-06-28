import type { DoctorReport } from '@testpilot/core'
import { ExitCode } from './exit-codes.js'

/**
 * Maps a doctor report to a process exit code:
 * - no failing checks → 0 (warnings are not hard problems)
 * - an invalid-config failure → 3 (takes precedence — the most actionable blocker)
 * - any other failure (environment/project setup) → 4
 */
export function doctorExitCode(report: DoctorReport): number {
  const failures = report.checks.filter((check) => check.status === 'fail')
  if (failures.length === 0) {
    return ExitCode.OK
  }
  if (failures.some((check) => check.category === 'config')) {
    return ExitCode.CONFIG
  }
  return ExitCode.ENV
}
