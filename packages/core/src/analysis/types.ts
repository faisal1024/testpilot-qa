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
    | 'deprecated-rule-id'
    | 'no-files-matched'
    | 'test-tag-coverage'
    | 'playwright-config-partial'
    | 'playwright-config-ignored'
    | 'test-root-missing'
    | 'helpers-not-recognized'
    | 'helpers-not-analyzed'
    | 'uninspected-call-sites'
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
  /**
   * Findings counted but **not** scored, because the Locator Quality Score's
   * denominator is locator call sites and these are per-test (`require-test-tag`).
   * Present so the exclusion is visible rather than a silent adjustment.
   */
  unscoredFindings?: number
  /**
   * Which rules those came from, so a consumer can reconcile the count without
   * hardcoding rule ids. Only rules that actually produced findings.
   */
  unscoredRuleIds?: string[]
  /**
   * Call sites that take a selector argument the analyzer could **not** read —
   * an interpolated template literal, a variable, a selector the tokenizer
   * refused. They still count toward `QualityScore.callSites` today (the
   * denominator moves in Phase 12), so a suite that interpolates heavily is
   * scored partly over locators no rule ever looked at. Reported so that is
   * visible rather than folded silently into a grade.
   */
  uninspectedCallSites?: number
  findings: number
  bySeverity: Record<FindingSeverity, number>
}

/** Letter grade band for a 0–100 score (A ≥90, B ≥80, C ≥70, D ≥60, F <60). */
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

/** A 0–100 score with its letter grade. */
export interface ScoreBreakdown {
  /** `null` in the same case as {@link QualityScore.score}: no evidence to grade. */
  score: number | null
  grade: Grade | null
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
  /**
   * `null` when every call site was uninspectable: there were locators, and not
   * one of them could be read. A `100 (A)` there would be a grade over evidence
   * that does not exist — the one case where no number is the honest answer.
   * (Zero call sites is different and still scores 100; see `docs/Scoring.md`.)
   */
  score: number | null
  grade: Grade | null
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
  /**
   * Of those, how many matched under a rule's **previous** id — a baseline
   * recorded before that rule was split or renamed. Reported so the absorption
   * is visible: silently accepting them is the behaviour the successor map was
   * added to replace, not to reproduce.
   */
  matchedByPreviousId?: number
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
 * 1.8 `discovery.playwrightConfigDeclaresTags`;
 * 1.9 `summary.unscoredFindings` + `summary.unscoredRuleIds`;
 * 1.10 `baseline.matchedByPreviousId`;
 * 1.11 `summary.uninspectedCallSites` + `score.score`/`grade` (headline and every sub-score)
 * become nullable.
 *
 * **1.11 is the first 1.x bump that is not purely additive**: it narrows an
 * existing field. A consumer doing `if (report.score.score < 80) fail()` passes
 * on `null` — a false green in the one field this project exists to protect —
 * so check for `null` explicitly. It occurs only when there is at least one
 * locator call-site and not one of them had a statically readable selector.
 */
export const ANALYSIS_SCHEMA_VERSION = '1.11'

/**
 * Human + machine-readable education for a single rule (`testpilot explain`).
 * Tier 1 / static: examples are self-contained illustrations and never claim
 * knowledge of the user's actual DOM.
 */
export interface RuleExplanation {
  id: string
  category: RuleCategory
  defaultSeverity: FindingSeverity
  /** True when the rule only runs if the config opts in. */
  defaultOff?: boolean
  title: string
  summary: string
  whyItMatters: string
  badExample: string
  betterExample: string
  guidance: string[]
  /**
   * Selectors this rule deliberately does **not** flag, with the reason.
   *
   * Shared by the generated docs and the rule's tests, so "does not fire on"
   * cannot drift from what the code does.
   */
  notFlagged?: string[]
  docsUrl: string
}
