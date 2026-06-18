import type { Rule } from './types.js'

/** Flags Playwright hard waits (`waitForTimeout`). A flakiness rule, not a locator rule. */
export const noHardWait: Rule = {
  id: 'no-hard-wait',
  category: 'flakiness',
  defaultSeverity: 'error',
  docsUrl: 'https://testpilot.dev/rules/no-hard-wait',
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
