import type { DoctorCheck, DoctorReport } from '@testpilot/core'
import { describe, expect, it } from 'vitest'
import { doctorExitCode } from '../src/util/doctor-exit.js'

function report(checks: Partial<DoctorCheck>[]): DoctorReport {
  return {
    schemaVersion: '1.0',
    command: 'doctor',
    status: 'pass',
    checks: checks.map((check, index) => ({
      id: `c${index}`,
      title: 't',
      category: 'project',
      status: 'pass',
      message: '',
      ...check,
    })),
    nextActions: [],
  }
}

describe('doctorExitCode', () => {
  it('returns 0 when nothing fails (warnings are not hard problems)', () => {
    expect(doctorExitCode(report([{ status: 'pass' }, { status: 'warn' }]))).toBe(0)
  })

  it('returns 4 for an environment/project failure', () => {
    expect(doctorExitCode(report([{ status: 'fail', category: 'environment' }]))).toBe(4)
    expect(doctorExitCode(report([{ status: 'fail', category: 'project' }]))).toBe(4)
  })

  it('returns 3 for an invalid-config failure', () => {
    expect(doctorExitCode(report([{ status: 'fail', category: 'config' }]))).toBe(3)
  })

  it('prefers 3 (config) when both config and environment fail', () => {
    expect(
      doctorExitCode(
        report([
          { status: 'fail', category: 'environment' },
          { status: 'fail', category: 'config' },
        ]),
      ),
    ).toBe(3)
  })
})
