import { noCssClassSelector } from './no-css-class-selector.js'
import { noXpath } from './no-xpath.js'
import type { Rule } from './types.js'

export type { Rule, RuleViolation } from './types.js'

/**
 * Built-in rules.
 *
 * Milestone 3A ships two reference rules to exercise the engine end to end. The
 * remaining locator rules (`no-nth-child`, `no-deep-css-chain`,
 * `no-id-structural-selector`, `prefer-user-facing-locator`, `no-hard-wait`)
 * land in Milestone 3B by adding entries here — the engine does not change.
 */
export const builtinRules: Rule[] = [noXpath, noCssClassSelector]

/** Looks up a built-in rule by id. */
export function getRule(id: string): Rule | undefined {
  return builtinRules.find((rule) => rule.id === id)
}
