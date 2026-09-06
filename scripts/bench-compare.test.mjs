import { describe, expect, it } from 'vitest'
import { diffRepo, formatDiff, isSignalLoss } from './bench-compare.mjs'

const measurement = (overrides = {}) => ({
  name: 'cal.com',
  filesAnalyzed: 60,
  parseErrors: 0,
  findings: 828,
  score: 68,
  callSites: 900,
  byRule: { 'no-xpath': 8, 'prefer-user-facing-locator': 820 },
  warnings: [],
  elapsedMs: 622,
  ...overrides,
})

describe('bench comparison', () => {
  it('reports nothing when only machine-dependent timing moved', () => {
    expect(diffRepo(measurement(), measurement({ elapsedMs: 4321 }))).toEqual([])
    expect(formatDiff([measurement()], [measurement({ elapsedMs: 4321 })])).toBeNull()
  })

  it('reports per-rule movement, not just the totals', () => {
    const after = measurement({
      findings: 300,
      byRule: { 'no-xpath': 8, 'prefer-user-facing-locator': 292 },
    })
    const rows = diffRepo(measurement(), after)
    expect(rows).toContainEqual({ metric: 'findings', before: 828, after: 300 })
    expect(rows).toContainEqual({
      metric: 'prefer-user-facing-locator',
      before: 820,
      after: 292,
    })
  })

  it('flags a narrowed scan as signal loss', () => {
    // The regression a score cannot show: fewer files, same grade.
    const rows = diffRepo(measurement(), measurement({ filesAnalyzed: 12, findings: 100 }))
    expect(isSignalLoss(rows)).toBe(true)
    expect(formatDiff([measurement()], [measurement({ filesAnalyzed: 12 })])?.signalLoss).toBe(true)
  })

  it('flags findings vanishing with no rule change as signal loss', () => {
    const rows = diffRepo(measurement(), measurement({ findings: 10 }))
    expect(isSignalLoss(rows)).toBe(true)
  })

  it('does not flag findings that fell because a rule got more precise', () => {
    // Phase 11 deliberately removes false positives; that is progress, not loss.
    const after = measurement({
      findings: 200,
      byRule: { 'no-xpath': 8, 'prefer-user-facing-locator': 192 },
    })
    expect(isSignalLoss(diffRepo(measurement(), after))).toBe(false)
  })

  it('surfaces a new warning code', () => {
    const rows = diffRepo(measurement(), measurement({ warnings: ['playwright-config-partial'] }))
    expect(rows).toContainEqual({
      metric: 'warnings',
      before: '(none)',
      after: 'playwright-config-partial',
    })
  })

  it('treats an unseen repo as new rather than as a regression', () => {
    expect(formatDiff([], [measurement()])?.signalLoss).toBe(false)
  })
})
