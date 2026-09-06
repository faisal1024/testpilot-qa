import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  COMPARED_METRICS,
  diffRepo,
  formatDiff,
  isSignalLoss,
  refsChanged,
  validateResults,
} from './bench-compare.mjs'

const baseline = JSON.parse(
  readFileSync(fileURLToPath(new URL('../bench/baseline.json', import.meta.url)), 'utf8'),
)
const recorded = baseline.results.find((result) => result.name === 'cal.com')

/**
 * Builds a measurement from the real recorded baseline and enforces the invariant the
 * tool guarantees: `findings` is the sum of `byRule`. An earlier version of this suite
 * passed only because its fixture violated that — a green test over a state no run can
 * produce, which is the failure mode this whole benchmark exists to end.
 */
function measurement(overrides = {}) {
  const result = { ...structuredClone(recorded), ...overrides }
  const total = Object.values(result.byRule ?? {}).reduce((sum, count) => sum + count, 0)
  if (result.findings !== total) {
    throw new Error(
      `fixture is impossible: findings ${result.findings} but byRule sums to ${total}`,
    )
  }
  return result
}

describe('bench comparison', () => {
  it('refuses to build a measurement the tool could never emit', () => {
    expect(() => measurement({ findings: 10 })).toThrow('fixture is impossible')
  })

  it('ignores machine-dependent timing', () => {
    expect(diffRepo(measurement(), measurement({ elapsedMs: 99999 }))).toEqual([])
    expect(formatDiff([measurement()], [measurement({ elapsedMs: 99999 })])).toBeNull()
  })

  describe('signal loss — the tool seeing less than it did', () => {
    const loses = (overrides) =>
      formatDiff([measurement()], [measurement(overrides)])?.signalLoss ?? false

    it('flags a narrowed scan', () => {
      expect(loses({ filesAnalyzed: recorded.filesAnalyzed - 1 })).toBe(true)
    })

    it('flags locator extraction regressing, even with findings intact', () => {
      // `callSites` is the denominator: fewer of them means we opened the files and
      // stopped seeing the locators in them.
      expect(loses({ callSites: 40 })).toBe(true)
    })

    it('flags a parser regression', () => {
      expect(loses({ parseErrors: 54 })).toBe(true)
    })

    it('flags discovery falling back from a real config to guessing', () => {
      expect(loses({ discovery: { testDir: 'default', include: 'default' } })).toBe(true)
    })

    it('flags a repo that vanished from the run', () => {
      // Otherwise `--only` plus a baseline write silently shrinks the corpus.
      expect(formatDiff(baseline.results, [measurement()]).signalLoss).toBe(true)
    })

    it('flags a warning starting to appear, and a second occurrence of one', () => {
      expect(loses({ warnings: { 'test-root-missing': 1 } })).toBe(true)
      const before = measurement({ warnings: { 'test-root-missing': 1 } })
      const after = measurement({ warnings: { 'test-root-missing': 2 } })
      expect(formatDiff([before], [after]).signalLoss).toBe(true)
    })

    it('flags the exit code changing', () => {
      expect(loses({ exitCode: 1 })).toBe(true)
    })
  })

  describe('precision work — findings moving without losing evidence', () => {
    it('does not flag half a rule’s findings being removed', () => {
      // Exactly the shape Phase 11 will produce: fewer findings, same files, same
      // call sites. If this fails the gate, the gate gets ignored.
      const rule = 'prefer-user-facing-locator'
      const removed = Math.floor(recorded.byRule[rule] / 2)
      const after = measurement({
        findings: recorded.findings - removed,
        byRule: { ...recorded.byRule, [rule]: recorded.byRule[rule] - removed },
        score: 82,
      })
      const diff = formatDiff([measurement()], [after])
      expect(diff.signalLoss).toBe(false)
      expect(diff.markdown).toContain(rule)
    })

    it('does not flag a rule being split into new ones', () => {
      const after = measurement({
        byRule: {
          ...recorded.byRule,
          'prefer-user-facing-locator': 0,
          'prefer-get-by-test-id': recorded.byRule['prefer-user-facing-locator'],
        },
      })
      expect(formatDiff([measurement()], [after]).signalLoss).toBe(false)
    })

    it('surfaces every moved rule in the table, gate or no gate', () => {
      const after = measurement({
        findings: recorded.findings + 5,
        byRule: { ...recorded.byRule, 'no-xpath': (recorded.byRule['no-xpath'] ?? 0) + 5 },
      })
      expect(diffRepo(measurement(), after)).toContainEqual({
        metric: 'no-xpath',
        before: recorded.byRule['no-xpath'] ?? 0,
        after: (recorded.byRule['no-xpath'] ?? 0) + 5,
      })
    })
  })

  describe('validateResults — what may not be recorded as a reference', () => {
    it('rejects a repo that analyzed nothing', () => {
      expect(validateResults([measurement({ filesAnalyzed: 0 })])[0]).toContain('analyzed 0 files')
    })

    it('rejects a run whose warnings the harness caused', () => {
      // A baseline carrying `test-root-missing` normalizes the very signal the tool
      // emits to say "I did not analyze this directory".
      expect(validateResults([measurement({ warnings: { 'test-root-missing': 1 } })])[0]).toContain(
        'test-root-missing',
      )
    })

    it('rejects discovery anchored outside the checkout', () => {
      const problems = validateResults([
        measurement({ rootOutsideCheckout: true, rootDir: '/somewhere/else' }),
      ])
      expect(problems[0]).toContain('outside the checkout')
    })

    it('accepts the committed baseline', () => {
      expect(validateResults(baseline.results)).toEqual([])
    })
  })

  it('reports a moved corpus pin so churn is never read as a tool change', () => {
    expect(refsChanged({ 'cal.com': 'aaa' }, { 'cal.com': 'bbb' })).toEqual([
      { name: 'cal.com', before: 'aaa', after: 'bbb' },
    ])
    expect(refsChanged(baseline.corpusRefs, baseline.corpusRefs)).toEqual([])
  })

  it('pins the compared metric set, so dropping one is a deliberate act', () => {
    expect(COMPARED_METRICS).toEqual([
      'filesAnalyzed',
      'parseErrors',
      'findings',
      'score',
      'callSites',
      'exitCode',
    ])
  })
})
