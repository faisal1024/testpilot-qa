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

/** Letter grade band for a 0–100 score (A ≥90, B ≥80, C ≥70, D ≥60, F <60). */
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

/** A 0–100 score with its letter grade. */
export interface ScoreBreakdown {
  score: number
  grade: Grade
}

/** The dimensions a headline score decomposes into. */
export interface SubScores {
  resilience: ScoreBreakdown
  accessibility: ScoreBreakdown
  maintainability: ScoreBreakdown
  flakiness: ScoreBreakdown
}

/**
 * Deterministic, static (Tier 1) Locator Quality Score. The headline `score` is
 * computed from all findings over the analyzed call-site count; `subScores` break
 * the same penalty down by dimension. Not DOM-aware.
 */
export interface QualityScore {
  score: number
  grade: Grade
  /** Analyzed call-sites — the scoring denominator basis. */
  callSites: number
  subScores: SubScores
}

/** The full, JSON-serializable analysis report (`testpilot analyze --json`). */
export interface AnalysisReport {
  schemaVersion: string
  command: 'analyze'
  summary: AnalysisSummary
  score: QualityScore
  findings: Finding[]
  warnings: AnalysisWarning[]
  parseErrors: ParseError[]
}

/** Bumped on report-shape changes. 1.1 added warnings/parseErrors; 1.2 added `score`. */
export const ANALYSIS_SCHEMA_VERSION = '1.2'
