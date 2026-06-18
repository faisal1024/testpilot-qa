/**
 * @testpilot/locator-intelligence — static locator analysis (Tier 1).
 *
 * Milestone 3A: the foundation — AST parser, locator extractor, rule engine,
 * and the `analyze` orchestrator that emits the shared AnalysisReport. Two
 * reference rules ship to exercise the pipeline; more arrive in 3B.
 */
export { analyze, type AnalyzeOptions } from './analyze.js'
export { extractLocators, inferEngine } from './extractor.js'
export type { LocatorApi, LocatorContext, SelectorEngine } from './locator-context.js'
export { type AstNode, parseSource, walk } from './parser.js'
export { resolveTestFiles } from './resolve-files.js'
export { builtinRules, getRule, type Rule, type RuleViolation } from './rules/index.js'
