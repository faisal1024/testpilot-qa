import type { LocatorContext } from '@testpilot/locator-intelligence'
import { describe, expect, it } from 'vitest'
import { ruleExplanations } from '../src/explanations.js'
import { extractLocators } from '../src/extractor.js'
import { parseSource } from '../src/parser.js'
import { getRule } from '../src/rules/index.js'

/**
 * Every "Does not fire on" example in the docs is executed against its own
 * rule.
 *
 * The plan asked for the docs and the tests to share fixtures for exactly this
 * reason: a "does not fire on" list that nothing runs is a promise, not a fact,
 * and every entry in it was a false positive at some point.
 */
/**
 * Builds contexts the way `analyze` does — parse the example, extract every
 * call site — rather than regexing one API out of it. The regex version only
 * understood `.locator(...)` and hardcoded `selectorEngine: 'css'`, so it could
 * not express an example about `getByRole()` at all, and asserted a context
 * shape the engine never produces.
 */
function contextsFor(example: string): LocatorContext[] {
  // Parsed whole, comment included: an example is valid JavaScript as written,
  // and splitting on `//` cut `page.locator('//button')` in half.
  return extractLocators(example, parseSource(example, 'example.ts'))
}

const withExamples = Object.values(ruleExplanations).filter(
  (explanation) => (explanation.notFlagged?.length ?? 0) > 0,
)

describe('docs "Does not fire on" examples', () => {
  it('there is at least one, so this suite cannot pass vacuously', () => {
    expect(withExamples.length).toBeGreaterThan(0)
  })

  it('every declared list is non-empty, so no rule is silently untested', () => {
    // An emptied `notFlagged` array yields an empty `describe` that passes.
    for (const explanation of Object.values(ruleExplanations)) {
      if (explanation.notFlagged !== undefined) {
        expect(explanation.notFlagged.length, explanation.id).toBeGreaterThan(0)
      }
    }
  })

  for (const explanation of withExamples) {
    describe(explanation.id, () => {
      const rule = getRule(explanation.id)

      for (const example of explanation.notFlagged ?? []) {
        it(`stays quiet on ${example.split(/\s{2,}\/\//)[0]?.trim()}`, () => {
          expect(rule, explanation.id).toBeDefined()
          if (!rule || rule.kind === 'test') {
            throw new Error('unreachable')
          }
          const contexts = contextsFor(example)
          expect(contexts.length, `no call site found in: ${example}`).toBeGreaterThan(0)
          for (const context of contexts) {
            expect(rule.evaluate(context), example).toBeNull()
          }
        })
      }
    })
  }
})
