import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  COMPARED_METRICS,
  deadPatterns,
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

    it('flags a repo starting to fail, but not one that stops failing', () => {
      expect(loses({ exitCode: 1 })).toBe(true)
      const failing = measurement({ exitCode: 1 })
      expect(formatDiff([failing], [measurement()]).signalLoss).toBe(false)
    })

    it('flags the page-object disclosure regressing', () => {
      // Recorded as a count, not as "the warning fired": a probe that drops from 73
      // files to 1 still fires, and a warning-count row would stay green.
      const before = measurement({ helpersNotAnalyzed: 73 })
      const after = measurement({ helpersNotAnalyzed: 1 })
      expect(formatDiff([before], [after]).signalLoss).toBe(true)
    })

    it('flags default discovery finding fewer files', () => {
      const before = measurement({ filesFromRepoRoot: 61 })
      const after = measurement({ filesFromRepoRoot: 0 })
      expect(formatDiff([before], [after]).signalLoss).toBe(true)
    })

    it('does not conclude corpus-wide silence from a single-repo run', () => {
      // `--only` is the fastest iteration loop; firing the gate's scariest message for
      // an intended one-repo calibration is how the vocabulary stops being believed.
      const cal = baseline.results.find((result) => result.name === 'cal.com')
      // Pick a rule the baseline actually records rather than naming one: these
      // tests are about the comparison logic, and hardcoding `no-xpath` broke
      // them the moment a rule split zeroed it out.
      const [silenced, silencedCount] = Object.entries(cal.byRule)[0]
      const quieter = {
        ...cal,
        findings: cal.findings - silencedCount,
        byRule: Object.fromEntries(
          Object.entries(cal.byRule).filter(([rule]) => rule !== silenced),
        ),
      }
      expect(formatDiff([cal], [quieter], { corpusWide: false }).signalLoss).toBe(false)
      expect(formatDiff([cal], [quieter], { corpusWide: true }).signalLoss).toBe(true)
    })

    it('reports but does not gate silence when new rule ids appeared', () => {
      // A split explains the silence. Bailing out entirely would switch the check off
      // for every rule during exactly the phase that introduces new ids.
      // Rename whichever rule the first repo records into an id that is not in
      // the baseline, so this stays a test of the split-detection logic.
      const renamed = Object.keys(baseline.results[0].byRule)[0]
      const split = baseline.results.map((result) => ({
        ...result,
        byRule: Object.fromEntries(
          Object.entries(result.byRule).map(([rule, count]) =>
            rule === renamed ? ['a-brand-new-rule-id', count] : [rule, count],
          ),
        ),
      }))
      const diff = formatDiff(baseline.results, split)
      expect(diff.signalLoss).toBe(false)
      expect(diff.markdown).toContain('reads as a rule split')
    })

    it('flags a rule going silent across the whole corpus', () => {
      // Not calibration: a rule that fired everywhere now fires nowhere, and no new
      // rule id appeared to account for it.
      const wiped = baseline.results.map((result) => ({
        ...result,
        byRule: Object.fromEntries(
          Object.entries(result.byRule).filter(([rule]) => rule !== 'no-xpath'),
        ),
      }))
      const diff = formatDiff(baseline.results, wiped)
      expect(diff.signalLoss).toBe(true)
      expect(diff.markdown).toContain('silent across the whole corpus')
    })
  })

  describe('precision work — findings moving without losing evidence', () => {
    it('does not flag half a rule’s findings being removed', () => {
      // Exactly the shape Phase 11 will produce: fewer findings, same files, same
      // call sites. If this fails the gate, the gate gets ignored.
      const rule = 'prefer-semantic-locator'
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
          'prefer-semantic-locator': 0,
          'prefer-aria-locator': recorded.byRule['prefer-semantic-locator'],
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

    it('lets a new warning through on a comparison run, so the gate can see it', () => {
      // Recording one is a harness bug; a warning appearing on a comparison run is
      // very likely the tool regressing, and must reach the table rather than abort.
      const result = measurement({ warnings: { 'test-root-missing': 1 } })
      expect(validateResults([result], { recording: false })).toEqual([])
      expect(formatDiff([measurement()], [result]).signalLoss).toBe(true)
    })

    it('refuses to record an unrecognized warning code, rather than inheriting it', () => {
      // The recording rule is an allowlist: a warning added later must be considered,
      // not silently accepted as the expected state.
      expect(validateResults([measurement({ warnings: { 'some-future-code': 1 } })])[0]).toContain(
        'some-future-code',
      )
    })

    it('records a warning about the repository, but not one about the checkout', () => {
      // `helpers-not-analyzed` says the repo has a page-object layer we did not
      // analyze — a property of the corpus. `test-root-missing` says our checkout is
      // wrong. Only the second may never become the expected state.
      expect(validateResults([measurement({ warnings: { 'helpers-not-analyzed': 1 } })])).toEqual(
        [],
      )
      expect(validateResults([measurement({ warnings: { 'no-files-matched': 1 } })])[0]).toContain(
        'no-files-matched',
      )
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
  })

  it('has a baseline recorded from the pins currently in corpus.json', () => {
    // The real invariant: bumping a pin without re-recording must not pass PR CI and
    // then surface a week later in the scheduled run.
    const corpus = JSON.parse(
      readFileSync(fileURLToPath(new URL('../bench/corpus.json', import.meta.url)), 'utf8'),
    )
    const pins = Object.fromEntries(corpus.repos.map((repo) => [repo.name, repo.ref]))
    expect(refsChanged(baseline.corpusRefs, pins)).toEqual([])
  })

  it('has a baseline that records why it was accepted', () => {
    expect(baseline.reason).toBeTruthy()
    expect(baseline.results.every((result) => result.elapsedMs === undefined)).toBe(true)
  })

  it('pins the compared metric set, so dropping one is a deliberate act', () => {
    expect(COMPARED_METRICS).toEqual([
      'helpersNotAnalyzed',
      'filesAnalyzed',
      'parseErrors',
      'findings',
      'score',
      'callSites',
      'uninspectedCallSites',
      'exitCode',
    ])
  })

  describe('deadPatterns — a sparse pattern that materialized nothing', () => {
    // The corpus shrinking is invisible on a *new* entry: there is no baseline for it
    // to fall short of, so this guard is the only thing that objects.
    const materialized = ['e2e-tests/playwright/spec.ts', 'e2e-tests/playwright/lib/util.ts']

    it('accepts a pattern that materialized files', () => {
      expect(deadPatterns(['e2e-tests/playwright/'], materialized)).toEqual([])
    })

    it('flags a pattern present upstream but excluded by the sparse checkout', () => {
      // The distinction that matters: `.github/` exists in every one of these repos.
      expect(deadPatterns(['.github/', 'api/'], materialized)).toEqual(['.github/', 'api/'])
    })

    it('matches at any depth, as non-cone gitignore patterns do', () => {
      expect(deadPatterns(['lib/'], materialized)).toEqual([])
    })

    it('handles glob patterns instead of treating any prefix as a match', () => {
      expect(deadPatterns(['**/*.ts'], materialized)).toEqual([])
      expect(deadPatterns(['*.py', '**/*.does-not-exist'], materialized)).toEqual([
        '*.py',
        '**/*.does-not-exist',
      ])
    })
  })
})
