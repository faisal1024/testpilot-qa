import type { Finding, FindingSeverity, RuleCategory } from '@testpilot/core'
import { describe, expect, it } from 'vitest'
import { builtinRules } from '../src/rules/index.js'
import { type ScoringWeights, computeScore } from '../src/score.js'

// The default weights documented in docs/Scoring.md (config `scoring.weights`).
const WEIGHTS: ScoringWeights = { error: 5, warn: 2, info: 0.5 }

function f(severity: FindingSeverity, category: RuleCategory = 'locator'): Finding {
  return {
    ruleId: 'x',
    category,
    severity,
    message: '',
    file: 'tests/a.spec.ts',
    line: 1,
    column: 1,
    snippet: '',
    docsUrl: '',
  }
}

/**
 * These cases are the worked examples in docs/Scoring.md. If the scorer changes,
 * this test fails and the doc must be updated — the numbers stay honest.
 */
describe('docs/Scoring.md worked examples', () => {
  it('fragile file: 3 call-sites, one error + one warning → 53 (F)', () => {
    const score = computeScore([f('error'), f('warn')], 3, WEIGHTS)
    expect(score).toMatchObject({ score: 53, grade: 'F' })
  })

  it('healthy file: 5 call-sites, one info → 98 (A)', () => {
    const score = computeScore([f('info')], 5, WEIGHTS)
    expect(score).toMatchObject({ score: 98, grade: 'A' })
  })

  it('fixing the xpath error lifts the same file from 53 (F) to 87 (B)', () => {
    const score = computeScore([f('warn')], 3, WEIGHTS)
    expect(score).toMatchObject({ score: 87, grade: 'B' })
  })

  it('no call-sites → 100 (A): no detectable locator debt', () => {
    expect(computeScore([], 0, WEIGHTS)).toMatchObject({ score: 100, grade: 'A' })
  })

  it('penalty cannot drive the score below 0', () => {
    // 3 errors over 2 call-sites: penalty 15 > maxPenalty 10 → clamped to 0.
    expect(computeScore([f('error'), f('error'), f('error')], 2, WEIGHTS)).toMatchObject({
      score: 0,
      grade: 'F',
    })
  })

  it('default severities match the docs/Scoring.md "shipped defaults" list', () => {
    const bySeverity = (sev: FindingSeverity) =>
      builtinRules
        .filter((r) => r.defaultSeverity === sev)
        .map((r) => r.id)
        .sort()
    expect(bySeverity('error')).toEqual(
      ['no-css-class-selector', 'no-hard-wait', 'no-nth-child', 'no-xpath'].sort(),
    )
    expect(bySeverity('warn')).toEqual(['no-deep-css-chain', 'prefer-user-facing-locator'].sort())
    expect(bySeverity('info')).toEqual([]) // no info rules by default
  })

  it('sub-score penalties split by category and sum to the headline', () => {
    // 4 call-sites (maxPenalty 20): one locator error (5) + one flakiness warn (2).
    const score = computeScore([f('error', 'locator'), f('warn', 'flakiness')], 4, WEIGHTS)
    expect(score.score).toBe(65) // round(100 * (1 - 7/20))
    expect(score.subScores.resilience.score).toBe(75) // round(100 * (1 - 5/20))
    expect(score.subScores.flakiness.score).toBe(90) // round(100 * (1 - 2/20))
    expect(score.subScores.accessibility.score).toBe(100)
    expect(score.subScores.maintainability.score).toBe(100)
  })
})
