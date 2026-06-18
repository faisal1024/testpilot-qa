/**
 * Resolves the effective minimum-score threshold.
 *
 * Precedence: the `--min-score` CLI flag wins; otherwise `scoring.minScore` from
 * config; otherwise `undefined` (no gating — `analyze` exits 0 regardless).
 */
export function resolveMinScore(
  flag: number | undefined,
  configMinScore: number | undefined,
): number | undefined {
  return flag ?? configMinScore
}

/** True when a threshold is set and the score falls below it. */
export function isBelowThreshold(score: number, threshold: number | undefined): boolean {
  return threshold !== undefined && score < threshold
}
