import type { Finding, FindingSeverity } from '@testpilot/core'
import { describe, expect, it } from 'vitest'
import { buildBaseline, compareToBaseline, findingKey } from '../src/baseline/baseline.js'

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: 'no-xpath',
    category: 'locator',
    severity: 'error',
    message: 'm',
    file: 'tests/a.spec.ts',
    line: 3,
    column: 5,
    snippet: "page.locator('//button')",
    docsUrl: 'https://testpilot.dev/rules/no-xpath',
    ...overrides,
  }
}

describe('findingKey', () => {
  it('is independent of line, column, and severity', () => {
    const a = findingKey(finding({ line: 3, column: 5, severity: 'error' }))
    const b = findingKey(finding({ line: 99, column: 1, severity: 'warn' as FindingSeverity }))
    expect(a).toBe(b)
  })

  it('differs by rule, file, or snippet', () => {
    const base = findingKey(finding())
    expect(findingKey(finding({ ruleId: 'no-hard-wait' }))).not.toBe(base)
    expect(findingKey(finding({ file: 'tests/b.spec.ts' }))).not.toBe(base)
    expect(findingKey(finding({ snippet: 'other' }))).not.toBe(base)
  })

  it('is independent of snippet formatting (indentation, line wraps, interior spacing)', () => {
    const base = findingKey(finding({ snippet: "page.locator('//button')" }))
    // Leading/trailing indentation.
    expect(findingKey(finding({ snippet: "    page.locator('//button')  " }))).toBe(base)
    // A line-wrapped call.
    expect(findingKey(finding({ snippet: "page.locator(\n  '//button'\n)" }))).toBe(base)
    // Formatter-added interior spaces.
    expect(findingKey(finding({ snippet: "page.locator( '//button' )" }))).toBe(base)
    // Quote style is meaningful content, not whitespace — still distinct.
    expect(findingKey(finding({ snippet: 'page.locator("//button")' }))).not.toBe(base)
  })
})

describe('buildBaseline', () => {
  it('counts duplicate identities and is deterministic', () => {
    const baseline = buildBaseline([
      finding(),
      finding({ line: 9 }),
      finding({ ruleId: 'no-hard-wait' }),
    ])
    expect(baseline.schemaVersion).toBe('1.0')
    const xpath = baseline.entries.find((e) => e.ruleId === 'no-xpath')
    expect(xpath?.count).toBe(2)
    // Deterministic ordering (sorted by ruleId/file/snippet).
    expect(JSON.stringify(buildBaseline([finding(), finding()]))).toBe(
      JSON.stringify(buildBaseline([finding(), finding()])),
    )
  })
})

describe('compareToBaseline', () => {
  it('reports no new findings when nothing changed', () => {
    const findings = [finding(), finding({ ruleId: 'no-hard-wait' })]
    const result = compareToBaseline(findings, buildBaseline(findings))
    expect(result.newFindings).toEqual([])
    expect(result.baselinedFindings).toBe(2)
    expect(result.total).toBe(2)
  })

  it('ignores line/column movement (still baselined)', () => {
    const baseline = buildBaseline([finding({ line: 3 })])
    const result = compareToBaseline([finding({ line: 42 })], baseline)
    expect(result.newFindings).toEqual([])
  })

  it('ignores a severity change (still baselined)', () => {
    const baseline = buildBaseline([finding({ severity: 'error' })])
    const result = compareToBaseline([finding({ severity: 'warn' })], baseline)
    expect(result.newFindings).toEqual([])
  })

  it('flags a finding from a different rule as new', () => {
    const baseline = buildBaseline([finding()])
    const result = compareToBaseline(
      [finding(), finding({ ruleId: 'no-css-class-selector' })],
      baseline,
    )
    expect(result.newFindings.map((f) => f.ruleId)).toEqual(['no-css-class-selector'])
  })

  it('flags an extra duplicate beyond the baseline count as new', () => {
    const baseline = buildBaseline([finding()]) // count 1
    const result = compareToBaseline([finding(), finding({ line: 7 })], baseline) // two now
    expect(result.newFindings).toHaveLength(1)
    expect(result.baselinedFindings).toBe(1)
  })

  it('treats every finding as new against an empty baseline', () => {
    const result = compareToBaseline([finding()], { schemaVersion: '1.0', entries: [] })
    expect(result.newFindings).toHaveLength(1)
  })
})
