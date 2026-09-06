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
  /**
   * False when the rule's findings are counted but must not move the Locator
   * Quality Score.
   *
   * A property of the rule, deliberately **not** of its kind: "measured per
   * test" and "not scored" are different questions, and a later test-level rule
   * (a stray `test.only`, say) may well belong in the score. The score's
   * denominator is locator call sites, so a rule whose findings do not scale
   * with call sites cannot share it — `require-test-tag` on Ghost (95 call sites,
   * 321 tests) would turn a 98 into roughly 65 while measuring nothing.
   */
  scored?: boolean
}

/**
 * A rule is a pure function over a {@link LocatorContext}. It declares its
 * defaults; the engine resolves the effective severity from config and builds
 * the {@link import('@testpilot/core').Finding}.
 */
/** Per-rule settings from `testpilot.config.ts`. */
export interface RuleOptions {
  /** `no-deep-css-chain`: combinator steps at which a chain is "deep". */
  maxChainDepth?: number
  /**
   * `prefer-get-by-test-id`: attribute names that count as a test id, to match
   * a project's Playwright `testIdAttribute`.
   */
  testIdAttributes?: readonly string[]
}

export interface Rule extends RuleMeta {
  kind?: 'locator'
  evaluate(context: LocatorContext, options?: RuleOptions): RuleViolation | null
}

/**
 * A rule over a `test()` declaration rather than a locator call site — the
 * shape needed for anything about test *organization*. Kept a separate type so
 * the engine cannot accidentally hand one a `LocatorContext`.
 */
/** Facts about the run that a test-level rule needs beyond the declaration. */
export interface TestRuleContext {
  /**
   * True when the Playwright config declares a `tag` that applies to every test
   * in every file — so no test in this suite is untagged, whatever its own
   * declaration says.
   */
  playwrightConfigDeclaresTags: boolean
}

export interface TestRule extends RuleMeta {
  kind: 'test'
  evaluate(test: TestDeclaration, context: TestRuleContext): RuleViolation | null
}

/** Either rule kind, for lookups that only need the shared metadata. */
export type AnyRule = Rule | TestRule
