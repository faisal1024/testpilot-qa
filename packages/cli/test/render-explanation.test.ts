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
  docsUrl: 'https://testpilot.dev/rules/no-xpath',
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
    expect(out).toContain('Docs: https://testpilot.dev/rules/no-xpath')
  })
})
