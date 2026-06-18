/**
 * Shared analysis contract.
 *
 * These types are the stable boundary between the analyzer
 * (@testpilot/locator-intelligence, which produces them) and consumers (the CLI
 * and, later, reporters). They live in core because they are genuinely shared —
 * not because the analyzer logic does.
 */

/** Severity of an emitted finding. (Config severities also include `off` to disable a rule.) */
export type FindingSeverity = 'info' | 'warn' | 'error'

/** Category a rule belongs to. */
export type RuleCategory = 'locator' | 'flakiness' | 'accessibility' | 'maintainability'

/** A single rule violation at a source location. */
export interface Finding {
  ruleId: string
  category: RuleCategory
  severity: FindingSeverity
  message: string
  /** Path relative to the analysis cwd, using POSIX separators (stable across machines). */
  file: string
  /** 1-based line. */
  line: number
  /** 1-based column. */
  column: number
  /** The locator expression as written. */
  snippet: string
  /** Category-level guidance (never a concrete, DOM-derived rewrite in Tier 1). */
  suggestion?: string
  docsUrl: string
}

/** A non-fatal problem detected while analyzing (e.g. an unknown rule id in config). */
export interface AnalysisWarning {
  code: 'unknown-rule'
  message: string
  ruleId?: string
}

/** A file that could not be read or parsed. Reported, but does not fail the command. */
export interface ParseError {
  file: string
  message: string
}

export interface AnalysisSummary {
  /** Files matched for analysis (including any that failed to parse). */
  filesAnalyzed: number
  /** Subset of matched files that could not be parsed. */
  filesWithParseErrors: number
  findings: number
  bySeverity: Record<FindingSeverity, number>
}

/** The full, JSON-serializable analysis report (`testpilot analyze --json`). */
export interface AnalysisReport {
  schemaVersion: string
  command: 'analyze'
  summary: AnalysisSummary
  findings: Finding[]
  warnings: AnalysisWarning[]
  parseErrors: ParseError[]
}

/** Bumped only on changes to the report shape. 1.1 added `warnings` + `parseErrors`. */
export const ANALYSIS_SCHEMA_VERSION = '1.1'
