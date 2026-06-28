import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type TestPilotConfig, defaultConfig } from '@testpilot/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { analyze } from '../src/analyze.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'testpilot-analyze-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

// A spec exercising all six MVP rules (plus clean cases that must not fire).
const ALL_RULES = [
  "import { test } from '@playwright/test'",
  "test('violations', async ({ page }) => {",
  "  await page.locator('.btn-primary').click()", // no-css-class-selector + prefer
  "  await page.locator('//button').click()", // no-xpath
  "  await page.locator('ul li:nth-child(2)').click()", // no-nth-child + prefer
  "  await page.locator('header nav ul li a').click()", // no-deep-css-chain + prefer
  "  await page.getByRole('list').nth(3).click()", // no-nth-child (.nth)
  '  await page.waitForTimeout(1000)', // no-hard-wait
  "  await page.getByRole('button', { name: 'Save' }).click()", // clean
  '})',
].join('\n')

function writeFixture(relativePath: string, content: string): void {
  const full = join(dir, relativePath)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
}

function config(overrides: Partial<TestPilotConfig> = {}): TestPilotConfig {
  return { ...defaultConfig, ...overrides }
}

describe('analyze — Tier 1 rule set', () => {
  it('detects all six MVP rules with a stable, JSON-serializable report', async () => {
    writeFixture('tests/all.spec.ts', ALL_RULES)
    const report = await analyze({ cwd: dir, config: config() })

    expect(report.schemaVersion).toBe('1.2')
    expect(report.summary).toEqual({
      filesAnalyzed: 1,
      filesWithParseErrors: 0,
      findings: 9,
      bySeverity: { error: 5, warn: 4, info: 0 },
    })

    const ids = [...new Set(report.findings.map((f) => f.ruleId))].sort()
    expect(ids).toEqual([
      'no-css-class-selector',
      'no-deep-css-chain',
      'no-hard-wait',
      'no-nth-child',
      'no-xpath',
      'prefer-user-facing-locator',
    ])

    expect(JSON.parse(JSON.stringify(report))).toEqual(report)
  })

  it('produces identical output across runs (deterministic + sorted)', async () => {
    writeFixture('tests/all.spec.ts', ALL_RULES)
    const a = await analyze({ cwd: dir, config: config() })
    const b = await analyze({ cwd: dir, config: config() })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('reports 0 findings for clean user-facing locators', async () => {
    const clean = [
      "import { test } from '@playwright/test'",
      "test('clean', async ({ page }) => {",
      "  await page.getByRole('button', { name: 'Save' }).click()",
      "  await page.getByLabel('Email').fill('x')",
      '})',
    ].join('\n')
    writeFixture('tests/clean.spec.ts', clean)
    const report = await analyze({ cwd: dir, config: config() })
    expect(report.findings).toEqual([])
    expect(report.summary.findings).toBe(0)
  })

  describe('config severity overrides and off', () => {
    const single = [
      "import { test } from '@playwright/test'",
      "test('t', async ({ page }) => {",
      "  await page.locator('//button').click()",
      '  await page.waitForTimeout(5)',
      '})',
    ].join('\n')

    it('honors a severity override for each rule', async () => {
      writeFixture('tests/single.spec.ts', single)
      const report = await analyze({
        cwd: dir,
        config: config({ rules: { 'no-xpath': 'warn', 'no-hard-wait': 'info' } }),
      })
      expect(report.findings.find((f) => f.ruleId === 'no-xpath')?.severity).toBe('warn')
      expect(report.findings.find((f) => f.ruleId === 'no-hard-wait')?.severity).toBe('info')
    })

    it('disables each rule when set to off', async () => {
      writeFixture('tests/single.spec.ts', single)
      const report = await analyze({
        cwd: dir,
        config: config({ rules: { 'no-xpath': 'off', 'no-hard-wait': 'off' } }),
      })
      expect(report.findings).toEqual([])
    })
  })

  it('warns about unknown rule ids without failing', async () => {
    writeFixture('tests/single.spec.ts', "page.getByRole('button')")
    const report = await analyze({
      cwd: dir,
      config: config({ rules: { 'made-up-rule': 'error', 'another-bad-id': 'warn' } }),
    })
    expect(report.warnings).toEqual([
      {
        code: 'unknown-rule',
        ruleId: 'another-bad-id',
        message: expect.stringContaining('another-bad-id'),
      },
      {
        code: 'unknown-rule',
        ruleId: 'made-up-rule',
        message: expect.stringContaining('made-up-rule'),
      },
    ])
  })

  it('records parse errors in the report and keeps going', async () => {
    writeFixture('tests/broken.spec.ts', 'const = ;')
    writeFixture('tests/ok.spec.ts', "page.locator('//button')")
    const report = await analyze({ cwd: dir, config: config() })
    expect(report.summary.filesWithParseErrors).toBe(1)
    expect(report.parseErrors[0]?.file).toBe('tests/broken.spec.ts')
    expect(report.findings.some((f) => f.ruleId === 'no-xpath')).toBe(true)
  })

  it('accepts explicit glob patterns relative to cwd', async () => {
    writeFixture('e2e/login.spec.ts', "page.locator('.btn')")
    const report = await analyze({ cwd: dir, config: config(), patterns: ['e2e/**/*.spec.ts'] })
    expect(report.summary.filesAnalyzed).toBe(1)
    expect(report.findings.length).toBeGreaterThan(0)
  })

  describe('directory positionals', () => {
    it('expands a directory pattern into its test files', async () => {
      writeFixture('e2e/login.spec.ts', "page.locator('//button')")
      const report = await analyze({ cwd: dir, config: config(), patterns: ['e2e'] })
      expect(report.summary.filesAnalyzed).toBe(1)
      expect(report.findings.some((f) => f.ruleId === 'no-xpath')).toBe(true)
    })

    it('handles a trailing slash on the directory', async () => {
      writeFixture('e2e/login.spec.ts', "page.locator('//button')")
      const report = await analyze({ cwd: dir, config: config(), patterns: ['e2e/'] })
      expect(report.summary.filesAnalyzed).toBe(1)
    })

    it('treats a non-existent path as a literal glob (no match, no throw)', async () => {
      const report = await analyze({ cwd: dir, config: config(), patterns: ['does-not-exist'] })
      expect(report.summary.filesAnalyzed).toBe(0)
      expect(report.findings).toEqual([])
    })

    it('returns nothing for a directory with no matching test files', async () => {
      mkdirSync(join(dir, 'empty'), { recursive: true })
      writeFixture('empty/notes.md', '# not a test')
      const report = await analyze({ cwd: dir, config: config(), patterns: ['empty'] })
      expect(report.summary.filesAnalyzed).toBe(0)
    })

    it('mixes a directory positional with a glob positional', async () => {
      writeFixture('e2e/a.spec.ts', "page.locator('//button')")
      writeFixture('extra/b.spec.ts', "page.locator('.btn')")
      const report = await analyze({
        cwd: dir,
        config: config(),
        patterns: ['e2e', 'extra/**/*.spec.ts'],
      })
      expect(report.summary.filesAnalyzed).toBe(2)
    })
  })

  describe('scoring', () => {
    it('scores a clean, user-facing suite as 100/A', async () => {
      const clean = [
        "import { test } from '@playwright/test'",
        "test('clean', async ({ page }) => {",
        "  await page.getByRole('button', { name: 'Save' }).click()",
        "  await page.getByLabel('Email').fill('x')",
        '})',
      ].join('\n')
      writeFixture('tests/clean.spec.ts', clean)
      const report = await analyze({ cwd: dir, config: config() })
      expect(report.score.score).toBe(100)
      expect(report.score.grade).toBe('A')
      expect(report.score.callSites).toBe(2)
    })

    it('lowers the score for fragile locators with dimension breakdown', async () => {
      writeFixture('tests/all.spec.ts', ALL_RULES)
      const report = await analyze({ cwd: dir, config: config() })
      // 8 call-sites; penalty 33 (5 errors × 5 + 4 warns × 2) / max 40 → 18 (F).
      expect(report.score.callSites).toBe(8)
      expect(report.score).toMatchObject({ score: 18, grade: 'F' })
      expect(report.score.subScores.resilience).toEqual({ score: 30, grade: 'F' })
      expect(report.score.subScores.flakiness).toEqual({ score: 88, grade: 'B' })
      expect(report.score.subScores.accessibility.score).toBe(100)
      expect(report.score.subScores.maintainability.score).toBe(100)
    })

    it('reflects rule severity overrides and off in the score', async () => {
      writeFixture('tests/all.spec.ts', ALL_RULES)
      const allOff = await analyze({
        cwd: dir,
        config: config({
          rules: {
            'no-xpath': 'off',
            'no-css-class-selector': 'off',
            'no-nth-child': 'off',
            'no-deep-css-chain': 'off',
            'prefer-user-facing-locator': 'off',
            'no-hard-wait': 'off',
          },
        }),
      })
      expect(allOff.score.score).toBe(100)
      expect(allOff.findings).toEqual([])
    })

    it('respects custom scoring weights', async () => {
      writeFixture('tests/all.spec.ts', ALL_RULES)
      const report = await analyze({
        cwd: dir,
        config: config({ scoring: { weights: { error: 5, warn: 0, info: 0 } } }),
      })
      // warns now cost nothing: penalty 25 / max 40 → 38 (F).
      expect(report.score.score).toBe(38)
    })

    it('does not penalize the score for parse errors', async () => {
      writeFixture('tests/broken.spec.ts', 'const = ;')
      writeFixture('tests/clean.spec.ts', "page.getByRole('button')")
      const report = await analyze({ cwd: dir, config: config() })
      expect(report.summary.filesWithParseErrors).toBe(1)
      expect(report.score.score).toBe(100)
    })
  })
})
