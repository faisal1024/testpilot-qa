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
    if (abstentionFor(test, context) !== null || test.anchoredTags.length > 0) {
      return null
    }
    return {
      // Precisely "no tag `--tag` can select", not "no tag": a tag fused into a
      // word (`user@example.com`) IS a Playwright tag and `--grep` can reach it,
      // so claiming the test has none would be false — and `tags` counts it as
      // tagged, which would put the two commands in contradiction.
      message: 'This test carries no tag that `--tag` can select, so no tag-based run includes it.',
      suggestion:
        "Add a tag from the suite's existing vocabulary (see `testpilot tags`), either in the title (`test('checkout @smoke', …)`) or with the details argument (`{ tag: ['@smoke'] }`).",
    }
  },
}

/** Why a test was not judged, or `null` when it was. */
export type Abstention =
  /** The Playwright config tags every test, so none is untagged. */
  | 'config-tags'
  /** A title or `tag` entry — its own, or an ancestor's — is not statically readable. */
  | 'unreadable'

/**
 * Whether we know enough about this test to say anything about its tags, and if
 * not, why.
 *
 * Exported so the rule and the rollup share one predicate — otherwise `analyze`
 * reports one untagged count and `tags` reports another, from the same parser,
 * with nothing explaining the gap (on mattermost: 323 vs 397). The *reason*
 * matters too: reporting a config-wide tag as "not statically readable" would
 * be a false explanation for a correct abstention.
 */
export function abstentionFor(test: TestDeclaration, context: TestRuleContext): Abstention | null {
  // Playwright applies `testConfig.tag` to every test in every file, so when the
  // config declares one, no test in the suite is untagged. The report already
  // carries that fact as `discovery.playwrightConfigDeclaresTags`; claiming the
  // opposite two fields away would contradict our own output.
  if (context.playwrightConfigDeclaresTags) {
    return 'config-tags'
  }
  // Anything we could not read may well carry a tag we cannot see — the title,
  // this test's own `tag` entries, or those on an enclosing describe. Flagging
  // any of them would be an accusation based on our own blind spot, not on the
  // test. `tags` already reports these as vocabulary gaps.
  if (!test.titleKnown || test.dynamicTitle || !test.tagsComplete) {
    return 'unreadable'
  }
  return null
}
