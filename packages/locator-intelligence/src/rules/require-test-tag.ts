import type { TestDeclaration } from '../tags/extract-tests.js'
import type { TestRuleContext } from './types.js'
import type { TestRule } from './types.js'

/**
 * Flags tests that carry no tag.
 *
 * `off` by default, and deliberately so: a suite with no tag vocabulary would
 * otherwise light up with one finding per test the moment it installs
 * TestPilot, which says nothing about quality. It earns its keep only for a
 * team that has decided to adopt tags and wants to finish the job — so it is
 * opt-in, and `info` when enabled.
 *
 * This is the first rule about test *organization* rather than locators, which
 * is why it evaluates a declaration rather than a call site.
 */
export const requireTestTag: TestRule = {
  id: 'require-test-tag',
  category: 'maintainability',
  kind: 'test',
  defaultSeverity: 'info',
  defaultOff: true,
  // Per test, while the score's denominator is per call site.
  scored: false,
  docsUrl: 'https://github.com/faisal1024/testpilot-qa/blob/main/docs/rules/require-test-tag.md',
  evaluate(test: TestDeclaration, context: TestRuleContext) {
    if (!isJudgeable(test, context) || test.anchoredTags.length > 0) {
      return null
    }
    return {
      message: 'This test carries no tag, so no tag-based selection can include it.',
      suggestion:
        "Add a tag from the suite's existing vocabulary (see `testpilot tags`), either in the title (`test('checkout @smoke', …)`) or with the details argument (`{ tag: ['@smoke'] }`).",
    }
  },
}

/**
 * Whether we know enough about this test to say anything about its tags.
 *
 * Exported so the rule and the rollup share one predicate — otherwise
 * `analyze` reports one untagged count and `tags` reports another, from the
 * same parser, with nothing explaining the gap (on mattermost: 323 vs 397).
 */
export function isJudgeable(test: TestDeclaration, context: TestRuleContext): boolean {
  // Playwright applies `testConfig.tag` to every test in every file, so when the
  // config declares one, no test in the suite is untagged. The report already
  // carries that fact as `discovery.playwrightConfigDeclaresTags`; claiming the
  // opposite two fields away would contradict our own output.
  if (context.playwrightConfigDeclaresTags) {
    return false
  }
  // Anything we could not read may well carry a tag we cannot see — the title,
  // this test's own `tag` entries, or those on an enclosing describe. Flagging
  // any of them would be an accusation based on our own blind spot, not on the
  // test. `tags` already reports these as vocabulary gaps.
  return test.titleKnown && !test.dynamicTitle && test.tagsComplete
}
