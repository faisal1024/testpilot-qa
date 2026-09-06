import { describe, expect, it } from 'vitest'
import { isBelowThreshold, isValidMinScore, resolveMinScore } from '../src/util/gating.js'

describe('resolveMinScore', () => {
  it('prefers the CLI flag over config', () => {
    expect(resolveMinScore(90, 80)).toBe(90)
  })
  it('falls back to config when no flag is given', () => {
    expect(resolveMinScore(undefined, 80)).toBe(80)
  })
  it('is undefined (no gate) when neither is set', () => {
    expect(resolveMinScore(undefined, undefined)).toBeUndefined()
  })
  it('treats a 0 flag as an explicit threshold', () => {
    expect(resolveMinScore(0, 80)).toBe(0)
  })
})

describe('isBelowThreshold', () => {
  it('never gates without a threshold', () => {
    expect(isBelowThreshold(0, undefined)).toBe(false)
  })
  it('gates only when strictly below the threshold', () => {
    expect(isBelowThreshold(79, 80)).toBe(true)
    expect(isBelowThreshold(80, 80)).toBe(false)
    expect(isBelowThreshold(81, 80)).toBe(false)
  })

  it('fails a threshold on a null score, and passes when none is set', () => {
    // No score means no evidence. Passing here would make `--min-score` easiest
    // to satisfy on the suite it knows least about.
    expect(isBelowThreshold(null, 80)).toBe(true)
    expect(isBelowThreshold(null, 0)).toBe(true)
    expect(isBelowThreshold(null, undefined)).toBe(false)
  })
})

describe('isValidMinScore', () => {
  it('accepts values within 0–100 inclusive', () => {
    expect(isValidMinScore(0)).toBe(true)
    expect(isValidMinScore(80)).toBe(true)
    expect(isValidMinScore(100)).toBe(true)
  })
  it('rejects out-of-range values (a negative would silently disable the gate)', () => {
    expect(isValidMinScore(-1)).toBe(false)
    expect(isValidMinScore(101)).toBe(false)
  })
  it('rejects non-finite values', () => {
    expect(isValidMinScore(Number.NaN)).toBe(false)
    expect(isValidMinScore(Number.POSITIVE_INFINITY)).toBe(false)
  })
})
