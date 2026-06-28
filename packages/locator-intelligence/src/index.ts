/**
 * @testpilot/locator-intelligence — static locator analysis (Tier 1).
 *
 * Milestone 3A added the foundation (AST parser, extractor, rule engine,
 * analyze). Milestone 3B completes the MVP Tier 1 rule set (six rules) and adds
 * unknown-rule warnings and parse-error reporting to the report envelope.
 */
export { analyze, type AnalyzeOptions } from './analyze.js'
export { explanationIds, getExplanation, ruleExplanations } from './explanations.js'
export {
  computeFixes,
  type FileFixResult,
  type FixEdit,
  type FixKind,
  plainTextSelectorValue,
} from './fix.js'
export { extractLocators, inferEngine } from './extractor.js'
export type {
  AnalyzedApi,
  HardWaitApi,
  LocatorApi,
  LocatorContext,
  SelectorEngine,
} from './locator-context.js'
export { type AstNode, parseSource, walk } from './parser.js'
export { cssChainDepth } from './rules/no-deep-css-chain.js'
export { resolveTestFiles } from './resolve-files.js'
export { computeScore, gradeFor, type ScoringWeights } from './score.js'
export {
  builtinRuleIds,
  builtinRules,
  getRule,
  type Rule,
  type RuleViolation,
} from './rules/index.js'
