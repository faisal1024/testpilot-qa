import { describe, expect, it } from 'vitest'
import { isBelowThreshold, resolveMinScore } from '../src/util/gating.js'

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
})
