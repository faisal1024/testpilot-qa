import type { AnalysisReport, Finding } from '@testpilot/core'
import { describe, expect, it } from 'vitest'
import { toHtml } from '../src/util/html-report.js'

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
    docsUrl: 'https://github.com/faisal1024/testpilot-qa/blob/main/docs/rules/no-xpath.md',
    ...overrides,
  }
}

function report(overrides: Partial<AnalysisReport> = {}): AnalysisReport {
  return {
    schemaVersion: '1.5',
    command: 'analyze',
    rootDir: '/repo',
    discovery: { testDir: 'default', include: 'default', playwrightConfigPath: null },
    summary: {
      filesAnalyzed: 1,
      filesWithParseErrors: 0,
      findings: 1,
      bySeverity: { info: 0, warn: 0, error: 1 },
    },
    score: {
      score: 42,
      grade: 'F',
      callSites: 3,
      subScores: {
        resilience: { score: 30, grade: 'F' },
        accessibility: { score: 100, grade: 'A' },
        maintainability: { score: 100, grade: 'A' },
        flakiness: { score: 88, grade: 'B' },
      },
    },
    findings: [finding()],
    warnings: [],
    parseErrors: [],
    ...overrides,
  } as AnalysisReport
}

describe('toHtml', () => {
  it('produces a self-contained HTML document that loads nothing on open', () => {
    const html = toHtml(report())
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<style>')
    // Nothing is fetched when the file is opened: no scripts, no auto-loaded resources.
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/\ssrc=/i)
    expect(html).not.toMatch(/<link/i)
    expect(html).not.toMatch(/url\(/i)
    expect(html).not.toMatch(/@import/i)
    // The only URLs are click-through rule docs links (the GitHub rule docs).
    expect(html).not.toMatch(/https?:\/\/(?!github\.com\/faisal1024\/testpilot-qa\/)/)
  })

  it('shows the score, grade, sub-scores, and summary counts', () => {
    const html = toHtml(report())
    expect(html).toContain('42')
    expect(html).toContain('Grade F')
    expect(html).toContain('Resilience')
    expect(html).toContain('Flakiness')
    expect(html).toContain('call-site')
  })

  it('lists findings with rule, location, message, and a docs link', () => {
    const html = toHtml(report())
    expect(html).toContain('no-xpath')
    expect(html).toContain('tests/login.spec.ts:12:7')
    expect(html).toContain('XPath selectors are brittle.')
    expect(html).toContain(
      'href="https://github.com/faisal1024/testpilot-qa/blob/main/docs/rules/no-xpath.md"',
    )
  })

  it('states the static Tier 1 scope and makes no DOM-rewrite claims', () => {
    const html = toHtml(report()).toLowerCase()
    expect(html).toContain('tier')
    expect(html).toContain('no dom-aware suggestions')
    expect(html).toContain('no automatic rewrites')
    // Findings are framed as heuristic, not DOM-backed fact.
    expect(html).toContain('not dom-verified facts')
  })

  it('escapes user-controlled content (no HTML injection)', () => {
    const malicious = report({
      findings: [
        finding({
          file: 'tests/<img src=x onerror=alert(1)>.spec.ts',
          snippet: "page.locator('</style><script>alert(1)</script>')",
          message: 'Bad <b>bold</b> & "quotes"',
        }),
      ],
    })
    const html = toHtml(malicious)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp; &quot;quotes&quot;')
  })

  it('handles a clean report (zero findings) as a valid document', () => {
    const clean = report({
      summary: {
        filesAnalyzed: 2,
        filesWithParseErrors: 0,
        findings: 0,
        bySeverity: { info: 0, warn: 0, error: 0 },
      },
      score: {
        score: 100,
        grade: 'A',
        callSites: 0,
        subScores: {
          resilience: { score: 100, grade: 'A' },
          accessibility: { score: 100, grade: 'A' },
          maintainability: { score: 100, grade: 'A' },
          flakiness: { score: 100, grade: 'A' },
        },
      },
      findings: [],
    })
    const html = toHtml(clean)
    expect(html).toContain('100')
    expect(html).toContain('No locator issues found')
    expect(html.endsWith('</html>\n')).toBe(true)
  })

  it('includes the baseline summary when present', () => {
    const withBaseline = report({
      baseline: { path: 'testpilot-baseline.json', newFindings: 1, baselinedFindings: 4 },
    })
    const html = toHtml(withBaseline)
    expect(html).toContain('testpilot-baseline.json')
    expect(html).toContain('new finding')
  })

  it('renders and escapes the warnings and parse-error sections', () => {
    const html = toHtml(
      report({
        warnings: [{ code: 'unknown-rule', message: 'Unknown rule <script>x</script>' }],
        parseErrors: [{ file: 'tests/<b>broken</b>.spec.ts', message: 'Unexpected </script>' }],
      }),
    )
    expect(html).toContain('Warnings')
    expect(html).toContain('Could not parse')
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(html).toContain('&lt;b&gt;broken&lt;/b&gt;')
  })

  it('omits the suggestion and does not link an unsafe docsUrl', () => {
    const html = toHtml(
      report({
        findings: [finding({ suggestion: undefined, docsUrl: 'javascript:alert(1)' })],
      }),
    )
    expect(html).not.toContain('class="suggestion"')
    expect(html).not.toContain('javascript:alert(1)') // not rendered as an href at all
    expect(html).not.toMatch(/<a [^>]*href=/) // no link for a non-http docsUrl
    expect(html).toContain('no-xpath') // rule id still shown as plain text
  })

  it('groups findings by file in first-seen order (deterministic)', () => {
    const html = toHtml(
      report({
        findings: [
          finding({ file: 'tests/b.spec.ts' }),
          finding({ file: 'tests/a.spec.ts' }),
          finding({ file: 'tests/b.spec.ts', ruleId: 'no-hard-wait' }),
        ],
        summary: {
          filesAnalyzed: 2,
          filesWithParseErrors: 0,
          findings: 3,
          bySeverity: { info: 0, warn: 0, error: 3 },
        },
      }),
    )
    // b.spec.ts is seen first, so its group comes first.
    expect(html.indexOf('tests/b.spec.ts')).toBeLessThan(html.indexOf('tests/a.spec.ts'))
    expect(html).toContain('Findings (3)')
  })
})
