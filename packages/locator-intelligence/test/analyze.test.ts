import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { DEFAULT_DISCOVERY, type TestPilotConfig, defaultConfig } from '@testpilot/core'
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

    expect(report.schemaVersion).toBe('1.9')
    expect(report.summary).toEqual({
      helperFiles: 0,
      helpersNotAnalyzed: 0,
      filesAnalyzed: 1,
      filesWithParseErrors: 0,
      findings: 9,
      unscoredFindings: 0,
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

  it('analyzes JavaScript/JSX/TSX suites with the default include', async () => {
    writeFixture('tests/a.spec.js', "page.locator('//button')\n")
    writeFixture('tests/b.test.jsx', "const el = <div/>\npage.locator('.btn')\n")
    writeFixture('tests/c.spec.tsx', 'const el = <div/>\npage.waitForTimeout(500)\n')
    writeFixture('tests/d.spec.mjs', "page.locator('//a')\n")
    writeFixture('tests/e.spec.cjs', "page.locator('//a')\n")
    writeFixture('tests/f.e2e.ts', "page.locator('//a')\n") // cal.com naming
    writeFixture('tests/g.e2e-spec.ts', "page.locator('//a')\n") // immich naming
    writeFixture('tests/helpers/pom.ts', "page.locator('//a')\n") // not matched by default
    const report = await analyze({ cwd: dir, config: config() })
    expect(report.summary.filesAnalyzed).toBe(7)
    expect(report.summary.filesWithParseErrors).toBe(0)
    expect(report.rootDir).toBe(dir)
    // The page object is not analyzed — but the run says so rather than reporting a
    // score over the tests as if it covered the suite's locators.
    expect(report.warnings).toEqual([
      { code: 'helpers-not-analyzed', message: expect.stringContaining('1 page object') },
    ])
  })

  it('ignores build output by default so compiled tests are not analyzed twice', async () => {
    writeFixture('tests/a.spec.ts', "page.locator('//button')\n")
    writeFixture('tests/dist/a.spec.js', "page.locator('//button')\n")
    writeFixture('tests/build/a.spec.js', "page.locator('//button')\n")
    writeFixture('tests/node_modules/dep/a.spec.js', "page.locator('//button')\n")
    const report = await analyze({ cwd: dir, config: config() })
    expect(report.summary.filesAnalyzed).toBe(1)

    // A user-supplied `exclude` replaces the defaults — but never the node_modules
    // guard, or `fix --write` could rewrite dependency code.
    const custom = await analyze({ cwd: dir, config: config({ exclude: ['**/dist/**'] }) })
    expect(custom.summary.filesAnalyzed).toBe(2)
    expect(custom.findings.every((finding) => !finding.file.includes('node_modules'))).toBe(true)
  })

  it('honors an explicitly named path or glob even inside an excluded directory', async () => {
    writeFixture('dist/e2e/a.spec.js', "page.locator('//button')\n")
    // `exclude` keeps discovery out of build output; it must not overrule an explicit ask.
    const byPath = await analyze({ cwd: dir, config: config(), patterns: ['dist/e2e/a.spec.js'] })
    expect(byPath.summary.filesAnalyzed).toBe(1)
    const byGlob = await analyze({ cwd: dir, config: config(), patterns: ['dist/**/*.spec.js'] })
    expect(byGlob.summary.filesAnalyzed).toBe(1)
  })

  it('applies exclude to a directory argument (which is expanded with include)', async () => {
    writeFixture('e2e/a.spec.ts', "page.locator('//button')\n")
    writeFixture('e2e/dist/a.spec.js', "page.locator('//button')\n")
    const report = await analyze({ cwd: dir, config: config(), patterns: ['e2e'] })
    expect(report.summary.filesAnalyzed).toBe(1)
  })

  it('reports an absolute rootDir even when cwd is relative', async () => {
    writeFixture('tests/a.spec.ts', "page.locator('//button')\n")
    const previous = process.cwd()
    process.chdir(dir)
    try {
      const report = await analyze({ cwd: '.', config: config() })
      expect(isAbsolute(report.rootDir)).toBe(true)
      expect(report.findings[0]?.file).toBe('tests/a.spec.ts')
    } finally {
      process.chdir(previous)
    }
  })

  it('warns (no-files-matched) instead of scoring 100/A when nothing matches', async () => {
    writeFixture('tests/only.spec.rb', 'not a playwright test')
    const report = await analyze({ cwd: dir, config: config() })
    expect(report.summary.filesAnalyzed).toBe(0)
    expect(report.warnings).toEqual([
      { code: 'no-files-matched', message: expect.stringContaining('under testDir "tests"') },
    ])

    const byPattern = await analyze({ cwd: dir, config: config(), patterns: ['nope/**'] })
    expect(byPattern.warnings).toEqual([
      { code: 'no-files-matched', message: 'No test files matched nope/**.' },
    ])
  })

  it('resolves testDir against rootDir and reports paths relative to it', async () => {
    // Monorepo layout: config lives in packages/web, the command runs from packages/web/src.
    writeFixture('packages/web/tests/a.spec.ts', "page.locator('//button')\n")
    mkdirSync(join(dir, 'packages/web/src'), { recursive: true })
    const report = await analyze({
      cwd: join(dir, 'packages/web/src'),
      config: config(),
      rootDir: join(dir, 'packages/web'),
    })
    expect(report.summary.filesAnalyzed).toBe(1)
    expect(report.findings[0]?.file).toBe('tests/a.spec.ts')
    expect(report.rootDir).toBe(join(dir, 'packages/web'))
  })

  it('leaves page objects alone unless asked, then tags what it finds there', async () => {
    // Ghost's shape: the spec is clean, the page object holds the fragile locator.
    // Playwright never runs the page object, so its findings are real but belong in a
    // different bucket from the suite's own — and must not appear uninvited.
    writeFixture('tests/login.spec.ts', "page.getByRole('button', { name: 'Save' }).click()\n")
    writeFixture('pages/login-page.ts', "this.title = page.locator('.gh-article-title')\n")

    const withoutHelpers = await analyze({ cwd: dir, config: config() })
    expect(withoutHelpers.summary.filesAnalyzed).toBe(1)
    expect(withoutHelpers.findings).toEqual([])

    const scope = {
      root: join(dir, 'tests'),
      includeGlobs: defaultConfig.include,
      matchGlobs: [],
      matchRegex: [],
      excludeGlobs: defaultConfig.exclude,
      helperGlobs: ['**/pages/**'],
      helperRoot: dir,
      ignoreGlobs: [],
      ignoreRegex: [],
    }
    const withHelpers = await analyze({ cwd: dir, config: config(), scopes: [scope] })
    expect(withHelpers.summary.filesAnalyzed).toBe(2)
    expect(withHelpers.summary.helperFiles).toBe(1)
    expect(withHelpers.findings.length).toBeGreaterThan(0)
    expect(withHelpers.findings.every((finding) => finding.inHelper === true)).toBe(true)
    expect([...new Set(withHelpers.findings.map((finding) => finding.file))]).toEqual([
      'pages/login-page.ts',
    ])
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

describe('discovery warnings', () => {
  it('does not warn about a testDir that explicit patterns bypassed', async () => {
    // `analyze "e2e/**/*.spec.ts"` never consults testDir, so warning that the
    // default `tests/` is missing is a disclosure about the wrong directory.
    writeFixture('e2e/a.spec.ts', "test('x', async ({ page }) => { await page.locator('.a') })")
    const report = await analyze({
      cwd: dir,
      config: config(),
      patterns: ['e2e/**/*.spec.ts'],
      discovery: { ...DEFAULT_DISCOVERY, roots: [join(dir, 'tests')] },
    })
    expect(report.warnings.map((warning) => warning.code)).not.toContain('test-root-missing')
    expect(report.summary.filesAnalyzed).toBe(1)
  })

  it('still warns about a missing root when discovery chose it', async () => {
    writeFixture('tests/a.spec.ts', "test('x', async ({ page }) => { await page.locator('.a') })")
    const report = await analyze({
      cwd: dir,
      config: config(),
      discovery: { ...DEFAULT_DISCOVERY, roots: [join(dir, 'tests'), join(dir, 'gone')] },
    })
    expect(report.warnings.map((warning) => warning.code)).toContain('test-root-missing')
  })
})

describe('require-test-tag (opt-in)', () => {
  const TAGGED = [
    "import { test } from '@playwright/test'",
    "test('one @smoke', async ({ page }) => { await page.getByRole('button').click() })",
    "test('two', async ({ page }) => { await page.getByRole('link').click() })",
  ].join('\n')

  it('is off by default, even though it is not listed in `rules`', async () => {
    writeFixture('tests/a.spec.ts', TAGGED)
    const report = await analyze({ cwd: dir, config: config() })
    expect(report.findings.some((f) => f.ruleId === 'require-test-tag')).toBe(false)
  })

  it('stays off when other rules are configured', async () => {
    // "not turned off" must not mean "on" for a rule that needs opting into.
    writeFixture('tests/a.spec.ts', TAGGED)
    const report = await analyze({ cwd: dir, config: config({ rules: { 'no-xpath': 'warn' } }) })
    expect(report.findings.some((f) => f.ruleId === 'require-test-tag')).toBe(false)
  })

  it('flags only the untagged test when enabled', async () => {
    writeFixture('tests/a.spec.ts', TAGGED)
    const report = await analyze({
      cwd: dir,
      config: config({ rules: { 'require-test-tag': 'info' } }),
    })
    const found = report.findings.filter((f) => f.ruleId === 'require-test-tag')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ line: 3, severity: 'info', category: 'maintainability' })
  })

  it('counts a describe tag as covering the tests inside it', async () => {
    writeFixture(
      'tests/a.spec.ts',
      [
        "test.describe('group @regression', () => {",
        "  test('one', async ({ page }) => { await page.getByRole('button').click() })",
        '})',
      ].join('\n'),
    )
    const report = await analyze({
      cwd: dir,
      config: config({ rules: { 'require-test-tag': 'info' } }),
    })
    expect(report.findings.some((f) => f.ruleId === 'require-test-tag')).toBe(false)
  })

  it('does not flag a test whose title it could not read', async () => {
    // The title may well carry a tag; flagging would accuse the test of our own
    // blind spot.
    writeFixture(
      'tests/a.spec.ts',
      [
        'for (const n of NAMES) {',
        '  test(n, async ({ page }) => { await page.click() })',
        '}',
      ].join('\n'),
    )
    const report = await analyze({
      cwd: dir,
      config: config({ rules: { 'require-test-tag': 'info' } }),
    })
    expect(report.findings.some((f) => f.ruleId === 'require-test-tag')).toBe(false)
  })

  it('counts its findings but does not let them move the score', async () => {
    // The score's denominator is call sites; a per-test rule has no relation to
    // it. On Ghost (95 call sites, 321 tests) scoring this would drop 98 to ~64.
    writeFixture(
      'tests/a.spec.ts',
      [
        "import { test } from '@playwright/test'",
        ...Array.from(
          { length: 20 },
          (_unused, index) =>
            `test('case ${index}', async ({ page }) => { await page.getByRole('button').click() })`,
        ),
      ].join('\n'),
    )
    const off = await analyze({ cwd: dir, config: config() })
    const on = await analyze({
      cwd: dir,
      config: config({ rules: { 'require-test-tag': 'info' } }),
    })
    expect(on.summary.findings).toBe(off.summary.findings + 20)
    expect(on.summary.unscoredFindings).toBe(20)
    expect(on.score).toEqual(off.score)
  })

  it('is not an unknown rule', async () => {
    writeFixture('tests/a.spec.ts', TAGGED)
    const report = await analyze({
      cwd: dir,
      config: config({ rules: { 'require-test-tag': 'info' } }),
    })
    expect(report.warnings.some((w) => w.code === 'unknown-rule')).toBe(false)
  })
})
