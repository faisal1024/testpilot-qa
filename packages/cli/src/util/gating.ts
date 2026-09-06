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

/**
 * True when a threshold is set and the score falls below it.
 *
 * A `null` score — every call site unreadable — fails a threshold rather than
 * passing it. The gate asked for evidence of locator quality and there is none;
 * letting a fully interpolated suite through any bar would make `--min-score`
 * easiest to satisfy exactly where it is least informed.
 */
export function isBelowThreshold(score: number | null, threshold: number | undefined): boolean {
  if (threshold === undefined) {
    return false
  }
  return score === null || score < threshold
}

/** Validates a `--min-score` value against the same 0–100 range as config. */
export function isValidMinScore(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100
}
