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

const FIXTURE = [
  "import { test } from '@playwright/test'",
  "test('login', async ({ page }) => {",
  "  await page.locator('.btn-primary').click()",
  '  await page.locator(\'//button[@type="submit"]\').click()',
  "  await page.getByRole('button', { name: 'Save' }).click()",
  '})',
].join('\n')

function writeFixture(relativePath: string, content = FIXTURE): void {
  const full = join(dir, relativePath)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
}

function config(overrides: Partial<TestPilotConfig> = {}): TestPilotConfig {
  return { ...defaultConfig, ...overrides }
}

describe('analyze', () => {
  it('produces a stable report from configured test files', async () => {
    writeFixture('tests/login.spec.ts')

    const report = await analyze({ cwd: dir, config: config() })

    expect(report.schemaVersion).toBe('1.0')
    expect(report.command).toBe('analyze')
    expect(report.summary.filesAnalyzed).toBe(1)
    expect(report.summary.findings).toBe(2)
    expect(report.summary.bySeverity).toEqual({ error: 2, warn: 0, info: 0 })

    const ruleIds = report.findings.map((f) => f.ruleId)
    expect(ruleIds).toEqual(['no-css-class-selector', 'no-xpath'])
    expect(report.findings[0]?.file).toBe('tests/login.spec.ts')
    expect(report.findings[0]?.snippet).toContain('.btn-primary')
    // getByRole produced no finding (no false positives).
  })

  it('is JSON-serializable and round-trips', async () => {
    writeFixture('tests/login.spec.ts')
    const report = await analyze({ cwd: dir, config: config() })
    expect(JSON.parse(JSON.stringify(report))).toEqual(report)
  })

  it('honors a severity override from config', async () => {
    writeFixture('tests/login.spec.ts')
    const report = await analyze({ cwd: dir, config: config({ rules: { 'no-xpath': 'warn' } }) })
    const xpath = report.findings.find((f) => f.ruleId === 'no-xpath')
    expect(xpath?.severity).toBe('warn')
    expect(report.summary.bySeverity).toEqual({ error: 1, warn: 1, info: 0 })
  })

  it('disables a rule set to off', async () => {
    writeFixture('tests/login.spec.ts')
    const report = await analyze({
      cwd: dir,
      config: config({ rules: { 'no-css-class-selector': 'off' } }),
    })
    expect(report.findings.map((f) => f.ruleId)).toEqual(['no-xpath'])
  })

  it('accepts explicit glob patterns relative to cwd', async () => {
    writeFixture('e2e/login.spec.ts')
    const report = await analyze({ cwd: dir, config: config(), patterns: ['e2e/**/*.spec.ts'] })
    expect(report.summary.filesAnalyzed).toBe(1)
    expect(report.findings.length).toBeGreaterThan(0)
  })

  it('reports unparseable files via onParseError and continues', async () => {
    writeFixture('tests/broken.spec.ts', 'const = ;')
    const errors: string[] = []
    const report = await analyze({
      cwd: dir,
      config: config(),
      onParseError: (file) => errors.push(file),
    })
    expect(errors).toEqual(['tests/broken.spec.ts'])
    expect(report.findings).toEqual([])
  })
})
