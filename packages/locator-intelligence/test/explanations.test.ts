import { describe, expect, it } from 'vitest'
import { explanationIds, getExplanation, ruleExplanations } from '../src/explanations.js'
import { builtinRules } from '../src/rules/index.js'

describe('rule explanations', () => {
  it('covers exactly the built-in rules', () => {
    expect(explanationIds()).toEqual([
      'no-css-class-selector',
      'no-deep-css-chain',
      'no-hard-wait',
      'no-nth-child',
      'no-xpath',
      'prefer-user-facing-locator',
      'require-test-tag',
    ])
  })

  it('stays consistent with each rule (id, category, severity, docs)', () => {
    for (const rule of builtinRules) {
      const explanation = getExplanation(rule.id)
      expect(explanation, rule.id).toBeDefined()
      expect(explanation?.category).toBe(rule.category)
      expect(explanation?.defaultSeverity).toBe(rule.defaultSeverity)
      expect(explanation?.docsUrl).toBe(rule.docsUrl)
    }
  })

  it('provides complete, non-empty education for every rule', () => {
    for (const explanation of Object.values(ruleExplanations)) {
      expect(explanation.title.length, explanation.id).toBeGreaterThan(0)
      expect(explanation.summary.length, explanation.id).toBeGreaterThan(0)
      expect(explanation.whyItMatters.length, explanation.id).toBeGreaterThan(0)
      expect(explanation.badExample.length, explanation.id).toBeGreaterThan(0)
      expect(explanation.betterExample.length, explanation.id).toBeGreaterThan(0)
      expect(explanation.guidance.length, explanation.id).toBeGreaterThan(0)
    }
  })

  it('shows user-facing locators in locator-rule better examples', () => {
    for (const explanation of Object.values(ruleExplanations)) {
      if (explanation.category === 'locator') {
        expect(explanation.betterExample, explanation.id).toMatch(/getBy[A-Z]/)
      }
    }
  })

  it('recommends auto-waiting / web-first assertions for no-hard-wait', () => {
    const explanation = getExplanation('no-hard-wait')
    expect(explanation?.betterExample).toContain('expect(')
    expect(explanation?.guidance.join(' ')).toMatch(/auto-wait/i)
  })

  it('returns undefined for an unknown rule id', () => {
    expect(getExplanation('made-up-rule')).toBeUndefined()
  })
})
