import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ruleExplanations } from '../src/explanations.js'
import { renderRuleDoc, renderRuleIndex } from '../src/rule-docs.js'

const docsDir = fileURLToPath(new URL('../../../docs/rules/', import.meta.url))
const explanations = Object.values(ruleExplanations)

describe('docs/rules — generated rule pages', () => {
  it('every rule links to a docs page that exists in the repo', () => {
    for (const explanation of explanations) {
      const expected = `https://github.com/faisal1024/testpilot-qa/blob/main/docs/rules/${explanation.id}.md`
      expect(explanation.docsUrl, explanation.id).toBe(expected)
      expect(existsSync(`${docsDir}${explanation.id}.md`), `${explanation.id}.md`).toBe(true)
    }
  })

  it('committed pages match the generator (run `pnpm docs:rules` after editing explanations)', () => {
    for (const explanation of explanations) {
      const committed = readFileSync(`${docsDir}${explanation.id}.md`, 'utf8')
      expect(committed, explanation.id).toBe(renderRuleDoc(explanation))
    }
    expect(readFileSync(`${docsDir}README.md`, 'utf8')).toBe(renderRuleIndex(explanations))
  })
})
