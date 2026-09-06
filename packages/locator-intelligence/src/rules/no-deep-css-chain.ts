import { maxChainDepth } from '../selector/depth.js'
import type { Rule } from './types.js'

/** Combinator steps to flag (>= this many -> "deep"). Configurable per project. */
export const DEFAULT_MAX_CHAIN_DEPTH = 3

/**
 * Flags long CSS selector chains, which couple a test to DOM structure.
 *
 * Depth is now measured per selector in a list, from the tokenizer. The old
 * string-mangling neutralised brackets and split on whitespace, so a comma made
 * a list of shallow selectors look like one deep chain: `strong em, em strong`
 * scored 3 when each selector is one step deep.
 */
export const noDeepCssChain: Rule = {
  id: 'no-deep-css-chain',
  category: 'locator',
  defaultSeverity: 'warn',
  docsUrl: 'https://github.com/faisal1024/testpilot-qa/blob/main/docs/rules/no-deep-css-chain.md',
  evaluate(context, options) {
    if (context.isDynamic || context.apiCall !== 'locator' || !context.parsed) {
      return null
    }
    const depth = maxChainDepth(context.parsed)
    if (depth === null) {
      return null
    }
    const threshold = options?.maxChainDepth ?? DEFAULT_MAX_CHAIN_DEPTH
    if (depth < threshold) {
      return null
    }
    return {
      message: `This selector is ${depth} combinator steps deep, which couples the test to DOM structure.`,
      suggestion: 'Prefer a single user-facing locator such as getByRole() or getByTestId().',
    }
  },
}
