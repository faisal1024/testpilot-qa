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
export { DEFAULT_MAX_CHAIN_DEPTH } from './rules/no-deep-css-chain.js'
export { maxChainDepth } from './selector/depth.js'
export {
  discoveryBase,
  type ResolvedFiles,
  resolveFiles,
  resolveTestFiles,
} from './resolve-files.js'
export { type CollectTagsOptions, collectTags } from './tags/collect-tags.js'
export { type ExtractedTests, type TestDeclaration, extractTests } from './tags/extract-tests.js'
export {
  type AttributeSelector,
  type Combinator,
  type ComplexSelector,
  type CompoundSelector,
  type ParsedSelector,
  type PseudoSelector,
  type SelectorPart,
  tokenizeSelector,
} from './selector/index.js'
export { classTokens, cssSelectors } from './selector/query.js'
export { renderRuleDoc, renderRuleIndex } from './rule-docs.js'
export { computeScore, gradeFor, type ScoringWeights } from './score.js'
export {
  allBuiltinRules,
  builtinRuleIds,
  builtinRules,
  builtinTestRules,
  getRule,
  type AnyRule,
  type Rule,
  type RuleMeta,
  type RuleViolation,
  type TestRule,
  type TestRuleContext,
} from './rules/index.js'
