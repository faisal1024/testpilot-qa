import type { TestDeclaration } from '../tags/extract-tests.js'
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
  docsUrl: 'https://github.com/faisal1024/testpilot-qa/blob/main/docs/rules/require-test-tag.md',
  evaluate(test: TestDeclaration) {
    if (test.effectiveTags.length > 0) {
      return null
    }
    // A title we could not read may well carry a tag we cannot see. Flagging it
    // would be an accusation based on our own blind spot, not on the test.
    if (!test.titleKnown || test.dynamicTitle) {
      return null
    }
    return {
      message: 'This test carries no tag, so no tag-based selection can include it.',
      suggestion:
        "Add a tag from the suite's existing vocabulary (see `testpilot tags`), either in the title (`test('checkout @smoke', …)`) or with the details argument (`{ tag: ['@smoke'] }`).",
    }
  },
}
