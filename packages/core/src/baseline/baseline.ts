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
 * Normalizes a snippet for identity matching by removing whitespace that sits
 * *outside* string literals. This keeps a finding "baselined" across
 * formatting-only edits — re-indentation, line wraps, or a formatter
 * adding/removing spaces around tokens — so a benign reformat never resurfaces an
 * already-accepted finding as a regression.
 *
 * Whitespace *inside* a string/template literal is preserved verbatim, because it
 * is meaningful selector/text content: `getByText('Log in')` and
 * `getByText('Login')` must stay distinct identities, or a genuinely new finding
 * could be silently grandfathered in. Quote style and all other characters also
 * stay significant.
 */
function normalizeSnippet(snippet: string): string {
  let out = ''
  let quote: string | null = null
  for (let i = 0; i < snippet.length; i++) {
    const ch = snippet[i] as string
    if (quote) {
      out += ch
      if (ch === '\\' && i + 1 < snippet.length) {
        // Keep the escaped character verbatim (e.g. \' inside a string).
        i += 1
        out += snippet[i] as string
      } else if (ch === quote) {
        quote = null
      }
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      out += ch
    } else if (!/\s/.test(ch)) {
      out += ch
    }
    // Whitespace outside a literal is dropped.
  }
  return out
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
