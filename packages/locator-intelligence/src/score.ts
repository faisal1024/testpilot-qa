import type {
  Finding,
  FindingSeverity,
  Grade,
  QualityScore,
  RuleCategory,
  ScoreBreakdown,
  SubScores,
} from '@testpilot/core'

/** Severity → weight. Mirrors config `scoring.weights`. */
export type ScoringWeights = Record<FindingSeverity, number>

/** Maps a rule category to the score dimension it drives. */
const CATEGORY_DIMENSION: Record<RuleCategory, keyof SubScores> = {
  locator: 'resilience',
  flakiness: 'flakiness',
  accessibility: 'accessibility',
  maintainability: 'maintainability',
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Letter grade for a 0–100 score. */
export function gradeFor(score: number): Grade {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

/**
 * Converts a penalty / max-penalty pair into a score + grade.
 * With no possible penalty (no call-sites) there is no detectable locator debt,
 * so the score is a perfect 100.
 */
function toBreakdown(penalty: number, maxPenalty: number): ScoreBreakdown {
  const score =
    maxPenalty <= 0
      ? penalty <= 0
        ? 100
        : 0
      : clamp(Math.round(100 * (1 - penalty / maxPenalty)), 0, 100)
  return { score, grade: gradeFor(score) }
}

/**
 * Computes the deterministic Locator Quality Score.
 *
 *   penalty    = Σ weight(finding.severity)
 *   maxPenalty = callSites × weight(error)
 *   score      = clamp(round(100 × (1 − penalty / maxPenalty)), 0, 100)
 *
 * The headline uses all findings; each sub-score uses only the findings whose
 * category maps to that dimension, over the same denominator — so the dimension
 * penalties sum to the headline penalty. Accessibility/maintainability have no
 * rules yet, so they stay at 100 until such rules exist.
 */
export function computeScore(
  findings: Finding[],
  callSites: number,
  weights: ScoringWeights,
): QualityScore {
  const maxPenalty = callSites * weights.error

  let totalPenalty = 0
  const dimensionPenalty: Record<keyof SubScores, number> = {
    resilience: 0,
    accessibility: 0,
    maintainability: 0,
    flakiness: 0,
  }

  for (const finding of findings) {
    const weight = weights[finding.severity]
    totalPenalty += weight
    dimensionPenalty[CATEGORY_DIMENSION[finding.category]] += weight
  }

  const headline = toBreakdown(totalPenalty, maxPenalty)
  return {
    score: headline.score,
    grade: headline.grade,
    callSites,
    subScores: {
      resilience: toBreakdown(dimensionPenalty.resilience, maxPenalty),
      accessibility: toBreakdown(dimensionPenalty.accessibility, maxPenalty),
      maintainability: toBreakdown(dimensionPenalty.maintainability, maxPenalty),
      flakiness: toBreakdown(dimensionPenalty.flakiness, maxPenalty),
    },
  }
}
