import type { ConfigDiscovery } from '../config/discovery.js'
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
  /**
   * True when the finding came from a page object, fixture or helper rather than a
   * test Playwright runs. Real, but a different conversation from the suite's own.
   */
  inHelper?: boolean
  /** Path relative to `AnalysisReport.rootDir`, using POSIX separators (stable across machines). */
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
  code:
    | 'unknown-rule'
    | 'no-files-matched'
    | 'playwright-config-partial'
    | 'playwright-config-ignored'
    | 'test-root-missing'
    | 'helpers-not-recognized'
    | 'helpers-not-analyzed'
  message: string
  ruleId?: string
}

/** A file that could not be read or parsed. Reported, but does not fail the command. */
export interface ParseError {
  file: string
  message: string
}

export interface AnalysisSummary {
  /** How many of `filesAnalyzed` were page objects / fixtures / helpers. */
  helperFiles?: number
  /**
   * Page-object / fixture files that use Playwright and were **not** analyzed. Zero
   * once `--with-helpers` covers them. Recorded so a regression in the disclosure is
   * visible to the corpus benchmark, not only to a reader.
   */
  helpersNotAnalyzed?: number
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

/** Baseline comparison summary, present only when `--baseline` was used. */
export interface BaselineReport {
  path: string
  /** Findings not covered by the baseline (the regression set that gates CI). */
  newFindings: number
  /** Findings absorbed by the baseline (tolerated legacy debt). */
  baselinedFindings: number
}

/** The full, JSON-serializable analysis report (`testpilot analyze --json`). */
export interface AnalysisReport {
  schemaVersion: string
  command: 'analyze'
  /**
   * Absolute directory that `findings[].file` and `parseErrors[].file` are relative
   * to: the config file's directory for config-driven discovery, `cwd` for explicit
   * patterns. Consumers that need repo-relative paths (SARIF) re-resolve from here.
   */
  rootDir: string
  /** How the analyzed files were selected (config, Playwright config, or defaults). */
  discovery: ConfigDiscovery
  summary: AnalysisSummary
  score: QualityScore
  findings: Finding[]
  warnings: AnalysisWarning[]
  parseErrors: ParseError[]
  /** Present only when analyzed with `--baseline`. */
  baseline?: BaselineReport
}

/**
 * Bumped on report-shape changes. 1.1 warnings/parseErrors; 1.2 score; 1.3 optional baseline;
 * 1.4 `rootDir` + `no-files-matched` warning code; 1.5 `discovery`; 1.6 discovery warnings
 * (`playwright-config-partial`, `playwright-config-ignored`, `test-root-missing`);
 * 1.7 `inHelper` on findings + `summary.helperFiles`;
 * 1.8 `discovery.playwrightConfigDeclaresTags`.
 */
export const ANALYSIS_SCHEMA_VERSION = '1.8'

/**
 * Human + machine-readable education for a single rule (`testpilot explain`).
 * Tier 1 / static: examples are self-contained illustrations and never claim
 * knowledge of the user's actual DOM.
 */
export interface RuleExplanation {
  id: string
  category: RuleCategory
  defaultSeverity: FindingSeverity
  title: string
  summary: string
  whyItMatters: string
  badExample: string
  betterExample: string
  guidance: string[]
  docsUrl: string
}
