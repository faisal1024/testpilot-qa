import { avoidParentTraversal } from './avoid-parent-traversal.js'
import { avoidPositionalAccess } from './avoid-positional-access.js'
import { noCssClassSelector } from './no-css-class-selector.js'
import { noDeepCssChain } from './no-deep-css-chain.js'
import { noHardWait } from './no-hard-wait.js'
import { noNthChild } from './no-nth-child.js'
import { noXpath } from './no-xpath.js'
import { preferGetByTestId } from './prefer-get-by-test-id.js'
import { preferSemanticLocator } from './prefer-semantic-locator.js'
import { requireTestTag } from './require-test-tag.js'
import type { AnyRule, Rule, TestRule } from './types.js'

export type {
  AnyRule,
  Rule,
  RuleMeta,
  RuleViolation,
  TestRule,
  TestRuleContext,
} from './types.js'

/**
 * Built-in MVP Tier 1 rules (static analysis only). Order here does not affect
 * output — findings are sorted by file/line/column/rule.
 */
export const builtinRules: Rule[] = [
  noXpath,
  noCssClassSelector,
  noNthChild,
  noDeepCssChain,
  preferGetByTestId,
  preferSemanticLocator,
  noHardWait,
  avoidPositionalAccess,
  avoidParentTraversal,
]

/**
 * Built-in rules over `test()` declarations rather than locator call sites.
 * Extracting declarations is a second AST pass, so `analyze` only does it when
 * one of these is actually enabled — a suite that leaves them off pays nothing.
 */
export const builtinTestRules: TestRule[] = [requireTestTag]

/** Every built-in rule, of either kind. */
export const allBuiltinRules: AnyRule[] = [...builtinRules, ...builtinTestRules]

/** All built-in rule ids (for unknown-rule detection). */
export const builtinRuleIds: ReadonlySet<string> = new Set(allBuiltinRules.map((rule) => rule.id))

/** Looks up a built-in rule by id, of either kind. */
export function getRule(id: string): AnyRule | undefined {
  return allBuiltinRules.find((rule) => rule.id === id)
}
