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

/** Category a rule belongs to. Milestone 3A ships `locator` rules only. */
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

export interface AnalysisSummary {
  filesAnalyzed: number
  findings: number
  bySeverity: Record<FindingSeverity, number>
}

/** The full, JSON-serializable analysis report (`testpilot analyze --json`). */
export interface AnalysisReport {
  schemaVersion: string
  command: 'analyze'
  summary: AnalysisSummary
  findings: Finding[]
}

/** Bumped only on breaking changes to the report shape. */
export const ANALYSIS_SCHEMA_VERSION = '1.0'
