import type { FindingSeverity, RuleCategory } from '@testpilot/core'
import type { LocatorContext } from '../locator-context.js'
import type { TestDeclaration } from '../tags/extract-tests.js'

/** What a rule returns when it fires. The engine adds file/line/severity/docs. */
export interface RuleViolation {
  message: string
  /** Category-level guidance only (no concrete DOM-derived rewrites in Tier 1). */
  suggestion?: string
}

/** What every rule declares, whatever it evaluates over. */
export interface RuleMeta {
  id: string
  category: RuleCategory
  /** Severity used when the rule runs and config does not override it. */
  defaultSeverity: FindingSeverity
  docsUrl: string
  /**
   * True when the rule does not run unless the config opts in. A rule that
   * would fire once per test on a suite that never adopted the convention says
   * nothing about quality, so it has to be asked for.
   */
  defaultOff?: boolean
}

/**
 * A rule is a pure function over a {@link LocatorContext}. It declares its
 * defaults; the engine resolves the effective severity from config and builds
 * the {@link import('@testpilot/core').Finding}.
 */
export interface Rule extends RuleMeta {
  kind?: 'locator'
  evaluate(context: LocatorContext): RuleViolation | null
}

/**
 * A rule over a `test()` declaration rather than a locator call site — the
 * shape needed for anything about test *organization*. Kept a separate type so
 * the engine cannot accidentally hand one a `LocatorContext`.
 */
export interface TestRule extends RuleMeta {
  kind: 'test'
  evaluate(test: TestDeclaration): RuleViolation | null
}

/** Either rule kind, for lookups that only need the shared metadata. */
export type AnyRule = Rule | TestRule
