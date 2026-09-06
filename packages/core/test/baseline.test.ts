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
    docsUrl: 'https://github.com/faisal1024/testpilot-qa/blob/main/docs/rules/no-xpath.md',
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

  it('absorbs formatter whitespace noise (indentation, tabs, doubled spaces)', () => {
    const base = findingKey(finding({ snippet: "page.locator('//button')" }))
    // Leading/trailing indentation is trimmed.
    expect(findingKey(finding({ snippet: "    page.locator('//button')  " }))).toBe(base)
    // Tabs and doubled spaces collapse to a single space.
    expect(findingKey(finding({ snippet: "page.locator('a',\t\t{ x: 1 })" }))).toBe(
      findingKey(finding({ snippet: "page.locator('a',  { x: 1 })" })),
    )
    // Quote style is meaningful content, not whitespace — still distinct.
    expect(findingKey(finding({ snippet: 'page.locator("//button")' }))).not.toBe(base)
  })

  it('never collapses distinct content into one identity (no silent regression masking)', () => {
    // Different visible text must stay distinct, or a real new finding could be
    // silently grandfathered in.
    expect(findingKey(finding({ snippet: "page.getByText('Log in')" }))).not.toBe(
      findingKey(finding({ snippet: "page.getByText('Login')" })),
    )
    // A space inside a regex selector is meaningful (matches different text).
    expect(findingKey(finding({ snippet: 'page.getByText(/a b/)' }))).not.toBe(
      findingKey(finding({ snippet: 'page.getByText(/ab/)' })),
    )
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

describe('rule splits do not invalidate a baseline', () => {
  // A finding's identity is (ruleId, file, snippet), so renaming a rule made
  // every grandfathered finding read as new — 114 of them on cal.com, on a
  // suite where nothing changed. This is the promise the baseline exists for.
  const under = (ruleId: string): Finding => ({
    ruleId,
    category: 'locator',
    severity: 'warn',
    message: 'm',
    file: 'tests/a.spec.ts',
    line: 1,
    column: 1,
    snippet: "page.getByRole('listitem').nth(1)",
    docsUrl: 'https://example.test',
  })

  it('matches a finding recorded under the rule it was split out of', () => {
    const baseline = buildBaseline([under('no-nth-child')])
    const comparison = compareToBaseline([under('avoid-positional-access')], baseline)
    expect(comparison.newFindings).toEqual([])
    expect(comparison.baselinedFindings).toBe(1)
    expect(comparison.matchedByPreviousId).toBe(1)
  })

  it('reports how many matched that way, rather than absorbing them silently', () => {
    const baseline = buildBaseline([under('avoid-positional-access')])
    expect(
      compareToBaseline([under('avoid-positional-access')], baseline).matchedByPreviousId,
    ).toBe(0)
  })

  it('still calls a genuinely new finding new', () => {
    const baseline = buildBaseline([under('no-nth-child')])
    const extra = { ...under('avoid-positional-access'), snippet: 'page.getByRole("row").nth(2)' }
    expect(compareToBaseline([extra], baseline).newFindings).toHaveLength(1)
  })

  it('does not let a predecessor entry cover two current findings', () => {
    const baseline = buildBaseline([under('no-nth-child')])
    const comparison = compareToBaseline(
      [under('avoid-positional-access'), under('avoid-positional-access')],
      baseline,
    )
    expect(comparison.newFindings).toHaveLength(1)
  })
})
