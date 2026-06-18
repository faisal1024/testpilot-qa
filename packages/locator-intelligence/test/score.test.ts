import type { Finding, FindingSeverity, RuleCategory } from '@testpilot/core'
import { describe, expect, it } from 'vitest'
import { type ScoringWeights, computeScore, gradeFor } from '../src/score.js'

const WEIGHTS: ScoringWeights = { error: 5, warn: 2, info: 0.5 }

function finding(category: RuleCategory, severity: FindingSeverity): Finding {
  return {
    ruleId: 'x',
    category,
    severity,
    message: '',
    file: 'f.ts',
    line: 1,
    column: 1,
    snippet: '',
    docsUrl: '',
  }
}

describe('gradeFor', () => {
  it('maps scores to letter bands', () => {
    expect(gradeFor(100)).toBe('A')
    expect(gradeFor(90)).toBe('A')
    expect(gradeFor(89)).toBe('B')
    expect(gradeFor(80)).toBe('B')
    expect(gradeFor(79)).toBe('C')
    expect(gradeFor(70)).toBe('C')
    expect(gradeFor(69)).toBe('D')
    expect(gradeFor(60)).toBe('D')
    expect(gradeFor(59)).toBe('F')
    expect(gradeFor(0)).toBe('F')
  })
})

describe('computeScore', () => {
  it('is a perfect 100/A with no findings', () => {
    const score = computeScore([], 10, WEIGHTS)
    expect(score).toEqual({
      score: 100,
      grade: 'A',
      callSites: 10,
      subScores: {
        resilience: { score: 100, grade: 'A' },
        accessibility: { score: 100, grade: 'A' },
        maintainability: { score: 100, grade: 'A' },
        flakiness: { score: 100, grade: 'A' },
      },
    })
  })

  it('returns 100/A when there are zero call-sites (no detectable debt)', () => {
    const score = computeScore([], 0, WEIGHTS)
    expect(score.score).toBe(100)
    expect(score.grade).toBe('A')
  })

  it('penalizes warnings less than errors', () => {
    // 2 warns over 10 call-sites: penalty 4, max 50 → 92.
    expect(
      computeScore([finding('locator', 'warn'), finding('locator', 'warn')], 10, WEIGHTS).score,
    ).toBe(92)
  })

  it('combines errors and warnings across dimensions', () => {
    const score = computeScore(
      [finding('locator', 'error'), finding('flakiness', 'warn')],
      10,
      WEIGHTS,
    )
    // penalty 7 / max 50 → 86 (B).
    expect(score).toMatchObject({ score: 86, grade: 'B' })
    // resilience: 5/50 → 90; flakiness: 2/50 → 96; others 100.
    expect(score.subScores.resilience).toEqual({ score: 90, grade: 'A' })
    expect(score.subScores.flakiness).toEqual({ score: 96, grade: 'A' })
    expect(score.subScores.accessibility.score).toBe(100)
    expect(score.subScores.maintainability.score).toBe(100)
  })

  it('isolates sub-scores by dimension', () => {
    const flaky = computeScore([finding('flakiness', 'error')], 4, WEIGHTS)
    expect(flaky.subScores.flakiness.score).toBeLessThan(100)
    expect(flaky.subScores.resilience.score).toBe(100)

    const locator = computeScore([finding('locator', 'error')], 4, WEIGHTS)
    expect(locator.subScores.resilience.score).toBeLessThan(100)
    expect(locator.subScores.flakiness.score).toBe(100)
  })

  it('clamps to 0 when penalty exceeds the maximum', () => {
    // One call-site producing two findings: penalty 7 > max 5 → clamp 0.
    expect(
      computeScore([finding('locator', 'error'), finding('locator', 'warn')], 1, WEIGHTS).score,
    ).toBe(0)
  })

  it('respects custom scoring weights', () => {
    const weights: ScoringWeights = { error: 10, warn: 1, info: 0.1 }
    // 1 warn over 10 call-sites: penalty 1, max 100 → 99.
    expect(computeScore([finding('locator', 'warn')], 10, weights).score).toBe(99)
  })
})
