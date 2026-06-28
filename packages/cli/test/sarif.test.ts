import type { AnalysisReport, Finding } from '@testpilot/core'
import { describe, expect, it } from 'vitest'
import { toSarif } from '../src/util/sarif.js'

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: 'no-xpath',
    category: 'locator',
    severity: 'error',
    message: 'XPath selectors are brittle.',
    file: 'tests/login.spec.ts',
    line: 12,
    column: 7,
    snippet: "page.locator('//button')",
    suggestion: 'Prefer getByRole().',
    docsUrl: 'https://testpilot.dev/rules/no-xpath',
    ...overrides,
  }
}

function reportWith(findings: Finding[]): AnalysisReport {
  return { findings } as AnalysisReport
}

const LEVELS = ['error', 'warning', 'note']

/**
 * Asserts the structural invariants GitHub's code-scanning ingestion relies on.
 * Cheaper than vendoring the full SARIF 2.1.0 JSON schema, and covers the fields
 * a malformed reporter would actually break: rule/result alignment, level enums,
 * and 1-based physical locations with a repo-relative URI.
 */
function assertValidSarif(log: ReturnType<typeof toSarif>): void {
  expect(log.version).toBe('2.1.0')
  expect(typeof log.$schema).toBe('string')
  expect(log.runs.length).toBeGreaterThan(0)
  for (const run of log.runs) {
    expect(run.tool.driver.name).toBeTruthy()
    expect(run.tool.driver.version).toBeTruthy()
    const rules = run.tool.driver.rules
    for (const rule of rules) {
      expect(rule.id).toBeTruthy()
      expect(LEVELS).toContain(rule.defaultConfiguration.level)
    }
    for (const result of run.results) {
      expect(result.ruleId).toBeTruthy()
      expect(result.ruleIndex).toBeGreaterThanOrEqual(0)
      expect(result.ruleIndex).toBeLessThan(rules.length)
      expect(rules[result.ruleIndex]?.id).toBe(result.ruleId)
      expect(LEVELS).toContain(result.level)
      expect(result.message.text).toBeTruthy()
      expect(result.locations.length).toBeGreaterThan(0)
      const region = result.locations[0]?.physicalLocation.region
      const uri = result.locations[0]?.physicalLocation.artifactLocation.uri
      expect(uri).toBeTruthy()
      expect(uri?.startsWith('/')).toBe(false) // repo-relative, not absolute
      expect(region?.startLine).toBeGreaterThanOrEqual(1)
      expect(region?.startColumn).toBeGreaterThanOrEqual(1)
    }
  }
}

describe('toSarif', () => {
  it('produces a well-formed SARIF 2.1.0 envelope', () => {
    const sarif = toSarif(reportWith([finding()]))
    expect(sarif.version).toBe('2.1.0')
    expect(sarif.$schema).toContain('sarif-2.1.0')
    expect(sarif.runs).toHaveLength(1)
    expect(sarif.runs[0]?.tool.driver.name).toBe('TestPilot QA')
    expect(sarif.runs[0]?.tool.driver.informationUri).toContain('testpilot-qa')
  })

  it('maps each finding to a result at the right file and location', () => {
    const sarif = toSarif(reportWith([finding()]))
    const result = sarif.runs[0]?.results[0]
    expect(result?.ruleId).toBe('no-xpath')
    expect(result?.level).toBe('error')
    expect(result?.message.text).toBe('XPath selectors are brittle.')
    const region = result?.locations[0]?.physicalLocation.region
    expect(result?.locations[0]?.physicalLocation.artifactLocation.uri).toBe('tests/login.spec.ts')
    expect(region?.startLine).toBe(12)
    expect(region?.startColumn).toBe(7)
    expect(region?.snippet.text).toBe("page.locator('//button')")
  })

  it('maps severities to SARIF levels (error/warning/note)', () => {
    const sarif = toSarif(
      reportWith([
        finding({ severity: 'error' }),
        finding({ ruleId: 'no-hard-wait', severity: 'warn' }),
        finding({ ruleId: 'prefer-user-facing-locator', severity: 'info' }),
      ]),
    )
    expect(sarif.runs[0]?.results.map((r) => r.level)).toEqual(['error', 'warning', 'note'])
  })

  it('declares each rule once with its help URL and indexes results into it', () => {
    const sarif = toSarif(
      reportWith([finding(), finding({ line: 30 }), finding({ ruleId: 'no-hard-wait' })]),
    )
    const rules = sarif.runs[0]?.tool.driver.rules ?? []
    expect(rules.map((r) => r.id)).toEqual(['no-xpath', 'no-hard-wait'])
    expect(rules[0]?.helpUri).toBe('https://testpilot.dev/rules/no-xpath')
    // Two no-xpath results both point at rule index 0; the no-hard-wait result at index 1.
    expect(sarif.runs[0]?.results.map((r) => r.ruleIndex)).toEqual([0, 0, 1])
  })

  it('fingerprints findings stably (line movement does not change the fingerprint)', () => {
    const a = toSarif(reportWith([finding({ line: 12 })]))
    const b = toSarif(reportWith([finding({ line: 99 })]))
    expect(a.runs[0]?.results[0]?.partialFingerprints).toEqual(
      b.runs[0]?.results[0]?.partialFingerprints,
    )
    expect(a.runs[0]?.results[0]?.partialFingerprints['testpilotIdentity/v1']).toBeTruthy()
  })

  it('handles a clean report (no findings) as an empty, valid run', () => {
    const sarif = toSarif(reportWith([]))
    expect(sarif.runs[0]?.results).toEqual([])
    expect(sarif.runs[0]?.tool.driver.rules).toEqual([])
    assertValidSarif(sarif)
  })

  it('produces structurally valid SARIF across mixed severities and rules', () => {
    assertValidSarif(
      toSarif(
        reportWith([
          finding({ severity: 'error' }),
          finding({ ruleId: 'no-hard-wait', severity: 'warn', docsUrl: '' }),
          finding({
            ruleId: 'prefer-user-facing-locator',
            severity: 'info',
            suggestion: undefined,
          }),
          finding({ ruleId: 'no-hard-wait', severity: 'warn', line: 40 }),
        ]),
      ),
    )
  })
})
