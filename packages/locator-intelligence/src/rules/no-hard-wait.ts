import type { Rule } from './types.js'

/** Flags Playwright hard waits (`waitForTimeout`). A flakiness rule, not a locator rule. */
export const noHardWait: Rule = {
  id: 'no-hard-wait',
  category: 'flakiness',
  defaultSeverity: 'error',
  docsUrl: 'https://github.com/faisal1024/testpilot-qa/blob/main/docs/rules/no-hard-wait.md',
  evaluate(context) {
    if (context.apiCall === 'waitForTimeout') {
      return {
        message: 'Hard waits (waitForTimeout) make tests slow and flaky.',
        suggestion:
          'Rely on Playwright auto-waiting or a web-first assertion like expect(locator).toBeVisible().',
      }
    }
    return null
  },
}
