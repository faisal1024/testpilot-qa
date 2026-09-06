import type { Rule } from './types.js'

/**
 * Flags the `locator('..')` parent-traversal idiom.
 *
 * Split out of `no-xpath` at **info**. `..` is XPath, so `no-xpath` fired on it
 * at `error` — but it is a recognised Playwright idiom for reaching a
 * container, not the hand-written `//div[@class="x"]/span[2]` that rule is
 * about. On the corpus it was 9 of the 11 xpath findings, so the
 * loud rule was mostly reporting the quiet case and real XPath did not stand
 * out.
 */
export const avoidParentTraversal: Rule = {
  id: 'avoid-parent-traversal',
  category: 'locator',
  defaultSeverity: 'info',
  docsUrl:
    'https://github.com/faisal1024/testpilot-qa/blob/main/docs/rules/avoid-parent-traversal.md',
  evaluate(context) {
    if (context.isDynamic || !context.parsed) {
      return null
    }
    if (!isParentTraversal(context)) {
      return null
    }
    return {
      message: "locator('..') walks up to the parent element, so it depends on DOM nesting.",
      suggestion:
        'Prefer locating the container directly (getByRole with a name, or getByTestId), then narrowing inside it.',
    }
  },
}

/** True when every part of the selector is nothing but parent steps. */
export function isParentTraversal(context: {
  parsed?: { parts: Array<{ engine: string; body: string }> }
}): boolean {
  const parts = context.parsed?.parts ?? []
  return (
    parts.length > 0 &&
    parts.every((part) => part.engine === 'xpath' && PARENT_STEPS.test(part.body.trim()))
  )
}

/** `..`, `../..`, `../../..` — a path made only of parent steps. */
const PARENT_STEPS = /^\.\.(?:\/\.\.)*$/
