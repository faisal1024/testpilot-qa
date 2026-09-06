import type { LocatorContext } from '@testpilot/locator-intelligence'
import { describe, expect, it } from 'vitest'
import { ruleExplanations } from '../src/explanations.js'
import { getRule } from '../src/rules/index.js'
import { tokenizeSelector } from '../src/selector/tokenize.js'

/**
 * Every "Does not fire on" example in the docs is executed against its own
 * rule.
 *
 * The plan asked for the docs and the tests to share fixtures for exactly this
 * reason: a "does not fire on" list that nothing runs is a promise, not a fact,
 * and every entry in it was a false positive at some point.
 */
const CALL = /\.(locator|frameLocator)\(\s*(['"`])([\s\S]*?)\2\s*\)/

function contextFor(example: string): LocatorContext | null {
  const match = CALL.exec(example)
  if (!match) {
    return null
  }
  const selector = match[3] as string
  return {
    apiCall: match[1] as LocatorContext['apiCall'],
    selector,
    selectorEngine: 'css',
    isDynamic: false,
    parsed: tokenizeSelector(selector),
    raw: example,
    line: 1,
    column: 1,
  }
}

const withExamples = Object.values(ruleExplanations).filter(
  (explanation) => (explanation.notFlagged?.length ?? 0) > 0,
)

describe('docs "Does not fire on" examples', () => {
  it('there is at least one, so this suite cannot pass vacuously', () => {
    expect(withExamples.length).toBeGreaterThan(0)
  })

  for (const explanation of withExamples) {
    describe(explanation.id, () => {
      const rule = getRule(explanation.id)

      for (const example of explanation.notFlagged ?? []) {
        it(`stays quiet on ${example.split('//')[0]?.trim()}`, () => {
          expect(rule, explanation.id).toBeDefined()
          const context = contextFor(example)
          expect(context, `could not build a context from: ${example}`).not.toBeNull()
          if (!rule || rule.kind === 'test' || !context) {
            throw new Error('unreachable')
          }
          expect(rule.evaluate(context)).toBeNull()
        })
      }
    })
  }
})
