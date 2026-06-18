import { noCssClassSelector } from './no-css-class-selector.js'
import { noDeepCssChain } from './no-deep-css-chain.js'
import { noHardWait } from './no-hard-wait.js'
import { noNthChild } from './no-nth-child.js'
import { noXpath } from './no-xpath.js'
import { preferUserFacingLocator } from './prefer-user-facing-locator.js'
import type { Rule } from './types.js'

export type { Rule, RuleViolation } from './types.js'

/**
 * Built-in MVP Tier 1 rules (static analysis only). Order here does not affect
 * output — findings are sorted by file/line/column/rule.
 */
export const builtinRules: Rule[] = [
  noXpath,
  noCssClassSelector,
  noNthChild,
  noDeepCssChain,
  preferUserFacingLocator,
  noHardWait,
]

/** All built-in rule ids (for unknown-rule detection). */
export const builtinRuleIds: ReadonlySet<string> = new Set(builtinRules.map((rule) => rule.id))

/** Looks up a built-in rule by id. */
export function getRule(id: string): Rule | undefined {
  return builtinRules.find((rule) => rule.id === id)
}
