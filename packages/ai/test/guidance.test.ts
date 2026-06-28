import { describe, expect, it } from 'vitest'
import { CANONICAL_GUIDANCE } from '../src/guidance.js'

describe('canonical guidance', () => {
  it('covers the key Playwright + TestPilot instructions', () => {
    const g = CANONICAL_GUIDANCE
    // Locator hierarchy
    expect(g).toContain('getByRole')
    expect(g).toContain('getByLabel')
    expect(g).toContain('getByTestId')
    // Anti-patterns
    expect(g).toContain('waitForTimeout')
    expect(g).toContain('XPath')
    expect(g).toContain(':nth-child')
    // Web-first assertions
    expect(g).toContain('toBeVisible')
    // API testing
    expect(g).toContain('request')
    // TestPilot commands
    expect(g).toContain('testpilot analyze')
    expect(g).toContain('testpilot doctor')
    expect(g).toContain('testpilot explain')
  })

  it('clarifies that TestPilot does not replace Playwright', () => {
    expect(CANONICAL_GUIDANCE.toLowerCase()).toContain('not')
    expect(CANONICAL_GUIDANCE).toContain('Playwright runs the tests')
  })

  it('does not claim DOM-aware suggestions exist', () => {
    expect(CANONICAL_GUIDANCE).toContain('static (Tier 1)')
    expect(CANONICAL_GUIDANCE).toContain('does **not** inspect the DOM')
    expect(CANONICAL_GUIDANCE).toContain('no AI-generated tests')
  })
})
