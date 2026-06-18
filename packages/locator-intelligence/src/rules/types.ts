import type { FindingSeverity, RuleCategory } from '@testpilot/core'
import type { LocatorContext } from '../locator-context.js'

/** What a rule returns when it fires. The engine adds file/line/severity/docs. */
export interface RuleViolation {
  message: string
  /** Category-level guidance only (no concrete DOM-derived rewrites in Tier 1). */
  suggestion?: string
}

/**
 * A rule is a pure function over a {@link LocatorContext}. It declares its
 * defaults; the engine resolves the effective severity from config and builds
 * the {@link import('@testpilot/core').Finding}.
 */
export interface Rule {
  id: string
  category: RuleCategory
  defaultSeverity: FindingSeverity
  docsUrl: string
  evaluate(context: LocatorContext): RuleViolation | null
}
