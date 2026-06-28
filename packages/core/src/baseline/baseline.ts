import type { Finding } from '../analysis/types.js'

/** Bumped on changes to the baseline file shape. */
export const BASELINE_SCHEMA_VERSION = '1.0'

/**
 * One baselined finding identity and how many times it is allowed.
 * Identity is `ruleId` + `file` + normalized `snippet` — deliberately **not**
 * line/column/severity, so adding or removing lines elsewhere in a file (or
 * re-grading a rule) does not turn an existing finding into a "new" one.
 */
export interface BaselineEntry {
  ruleId: string
  file: string
  snippet: string
  count: number
}

export interface Baseline {
  schemaVersion: string
  entries: BaselineEntry[]
}

export interface BaselineComparison {
  /** Findings present now that the baseline does not cover (the regression set). */
  newFindings: Finding[]
  /** How many current findings were absorbed by the baseline. */
  baselinedFindings: number
  total: number
}

/**
 * Normalizes a snippet for identity matching by collapsing every run of
 * whitespace to a single space and trimming the ends. This absorbs the common
 * formatter noise — re-indentation, tabs vs spaces, doubled spaces — so a benign
 * reformat does not resurface an already-accepted finding as a regression.
 *
 * Deliberately *not* "strip all whitespace": that would collapse distinct
 * content — `getByText('Log in')` vs `getByText('Login')`, or a regex `/a b/`
 * vs `/ab/` — into one identity and could silently grandfather in a genuinely
 * new finding (a masked regression is the worst failure for a baseline). Keeping
 * a single space preserves the presence of intra-content whitespace, so distinct
 * selector text stays distinct. The accepted cost is that a hard line-wrapped
 * call site (whose wrap inserts a space where the inline form had none) may
 * register as new until the baseline is refreshed — a visible, safe miss rather
 * than a silent one.
 */
function normalizeSnippet(snippet: string): string {
  return snippet.replace(/\s+/g, ' ').trim()
}

/** Stable identity key for baseline matching (line/column/formatting independent). */
export function findingKey(finding: { ruleId: string; file: string; snippet: string }): string {
  return [finding.ruleId, finding.file, normalizeSnippet(finding.snippet)].join('\n')
}

function compareEntries(a: BaselineEntry, b: BaselineEntry): number {
  return (
    a.ruleId.localeCompare(b.ruleId) ||
    a.file.localeCompare(b.file) ||
    a.snippet.localeCompare(b.snippet)
  )
}

/** Builds a deterministic baseline (counts per identity) from findings. */
export function buildBaseline(findings: Finding[]): Baseline {
  const byKey = new Map<string, BaselineEntry>()
  for (const finding of findings) {
    const key = findingKey(finding)
    const existing = byKey.get(key)
    if (existing) {
      existing.count += 1
    } else {
      byKey.set(key, {
        ruleId: finding.ruleId,
        file: finding.file,
        snippet: finding.snippet,
        count: 1,
      })
    }
  }
  return {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    entries: [...byKey.values()].sort(compareEntries),
  }
}

/**
 * Compares current findings to a baseline. A finding is "new" when its identity
 * is absent from the baseline, or appears more times than the baseline allows.
 * Findings keep their analyze order; baseline order does not matter.
 */
export function compareToBaseline(findings: Finding[], baseline: Baseline): BaselineComparison {
  const remaining = new Map<string, number>()
  for (const entry of baseline.entries) {
    remaining.set(findingKey(entry), (remaining.get(findingKey(entry)) ?? 0) + entry.count)
  }

  const newFindings: Finding[] = []
  let baselinedFindings = 0
  for (const finding of findings) {
    const key = findingKey(finding)
    const left = remaining.get(key) ?? 0
    if (left > 0) {
      remaining.set(key, left - 1)
      baselinedFindings += 1
    } else {
      newFindings.push(finding)
    }
  }

  return { newFindings, baselinedFindings, total: findings.length }
}
