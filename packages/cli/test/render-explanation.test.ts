import type { RuleExplanation } from '@testpilot/core'
import { describe, expect, it } from 'vitest'
import { renderExplanationText } from '../src/util/render-explanation.js'

const EXPLANATION: RuleExplanation = {
  id: 'no-xpath',
  category: 'locator',
  defaultSeverity: 'error',
  title: 'Avoid XPath selectors',
  summary: 'XPath couples tests to the DOM tree.',
  whyItMatters: 'It breaks on structural changes.',
  badExample: "page.locator('//button')",
  betterExample: "page.getByRole('button', { name: 'Submit' })",
  guidance: ['Prefer getByRole.', 'Avoid XPath.'],
  docsUrl: 'https://github.com/faisal1024/testpilot-qa/blob/main/docs/rules/no-xpath.md',
}

describe('renderExplanationText', () => {
  it('includes the header, sections, examples, guidance, and docs URL', () => {
    const out = renderExplanationText(EXPLANATION)
    expect(out).toContain('no-xpath  [error] locator')
    expect(out).toContain('Avoid XPath selectors')
    expect(out).toContain('Why it matters')
    expect(out).toContain('✗ Bad')
    expect(out).toContain("page.locator('//button')")
    expect(out).toContain('✓ Better')
    expect(out).toContain("page.getByRole('button', { name: 'Submit' })")
    expect(out).toContain('- Prefer getByRole.')
    expect(out).toContain(
      'Docs: https://github.com/faisal1024/testpilot-qa/blob/main/docs/rules/no-xpath.md',
    )
  })
})

describe('opt-in rules', () => {
  it('says a defaultOff rule is off, not that it ships at its enabled severity', () => {
    // The one place a user asks "what is this rule?" must not imply it is on.
    const text = renderExplanationText({
      id: 'require-test-tag',
      category: 'maintainability',
      defaultSeverity: 'info',
      defaultOff: true,
      docsUrl: 'https://example.test/require-test-tag.md',
      title: 'Tag every test',
      summary: 'summary',
      whyItMatters: 'why',
      badExample: 'bad',
      betterExample: 'better',
      guidance: ['g'],
    })
    expect(text).toContain('off — info when enabled')
  })
})
