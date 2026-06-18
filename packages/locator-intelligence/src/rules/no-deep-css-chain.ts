import type { Rule } from './types.js'

/** Combinator steps to flag (>= this many → "deep"). Conservative to limit false positives. */
const MIN_CHAIN_DEPTH = 3

/**
 * Approximate combinator depth of a CSS selector. Bracketed/parenthesized
 * sections are neutralized first so their internal spaces are not miscounted,
 * then combinators (`>`, `+`, `~`, descendant whitespace) split compound parts.
 */
export function cssChainDepth(selector: string): number {
  const cleaned = selector
    .replace(/\[[^\]]*\]/g, '[]')
    .replace(/\([^)]*\)/g, '()')
    .replace(/[>+~]/g, ' ')
  const parts = cleaned.split(/\s+/).filter(Boolean)
  return Math.max(parts.length - 1, 0)
}

/** Flags long/deep CSS selector chains that couple tests to DOM structure. */
export const noDeepCssChain: Rule = {
  id: 'no-deep-css-chain',
  category: 'locator',
  defaultSeverity: 'warn',
  docsUrl: 'https://testpilot.dev/rules/no-deep-css-chain',
  evaluate(context) {
    if (context.isDynamic || context.apiCall !== 'locator') {
      return null
    }
    if (context.selectorEngine !== 'css' || context.selector === undefined) {
      return null
    }
    if (cssChainDepth(context.selector) >= MIN_CHAIN_DEPTH) {
      return {
        message: 'Deep CSS selector chains are tightly coupled to DOM structure.',
        suggestion: 'Prefer a single user-facing locator such as getByRole() or getByTestId().',
      }
    }
    return null
  },
}
