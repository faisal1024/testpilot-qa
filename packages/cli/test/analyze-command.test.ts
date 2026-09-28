import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildProgram } from '../src/program.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'testpilot-analyze-cmd-'))
  mkdirSync(join(dir, 'tests'), { recursive: true })
  writeFileSync(join(dir, 'tests', 'a.spec.ts'), "page.locator('//button')\n")
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

async function runAnalyze(extraArgs: string[] = []) {
  return runCli(['analyze', '--cwd', dir, ...extraArgs])
}

async function runCli(args: string[]) {
  const logs: string[] = []
  const errs: string[] = []
  let exitCode: number | undefined
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(' '))
  })
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errs.push(args.map(String).join(' '))
  })
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCode = code
    throw new Error('__exit__')
  }) as never)
  try {
    await buildProgram().parseAsync(['node', 'testpilot', ...args])
  } catch (error) {
    if (!(error instanceof Error) || error.message !== '__exit__') {
      throw error
    }
  } finally {
    logSpy.mockRestore()
    errSpy.mockRestore()
    exitSpy.mockRestore()
  }
  return { stdout: logs.join('\n'), stderr: errs.join('\n'), exitCode }
}

describe('analyze command output', () => {
  it('prints the human report to stdout (not stderr)', async () => {
    const { stdout, stderr } = await runAnalyze()
    expect(stdout).toContain('Locator Quality Score')
    expect(stdout).toContain('no-xpath')
    expect(stderr).toBe('')
  })

  it('prints JSON to stdout with --json', async () => {
    const { stdout } = await runAnalyze(['--json'])
    expect(JSON.parse(stdout).command).toBe('analyze')
  })

  it('prints nothing with --quiet', async () => {
    const { stdout, stderr } = await runAnalyze(['--quiet'])
    expect(stdout).toBe('')
    expect(stderr).toBe('')
  })
})

describe('analyze — nothing matched is never a pass', () => {
  it('exits 3 with guidance when the config include matches no files', async () => {
    rmSync(join(dir, 'tests'), { recursive: true, force: true })
    mkdirSync(join(dir, 'tests'))
    writeFileSync(join(dir, 'tests', 'a.spec.rb'), 'not playwright\n')
    const { stdout, stderr, exitCode } = await runAnalyze(['--min-score', '80'])
    expect(exitCode).toBe(3)
    expect(stdout).not.toContain('Locator Quality Score')
    expect(stderr).toContain('No test files matched')
    expect(stderr).toContain('testDir/include')
  })

  it('exits 2 when explicit patterns match no files', async () => {
    const { stderr, exitCode } = await runAnalyze(['nope/**/*.spec.ts'])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('No test files matched nope/**/*.spec.ts')
  })

  it('exits 3 and blames include when a directory argument matches nothing', async () => {
    mkdirSync(join(dir, 'e2e'))
    writeFileSync(join(dir, 'e2e', 'a.spec.rb'), 'not playwright\n')
    const { stderr, exitCode } = await runAnalyze(['e2e'])
    expect(exitCode).toBe(3)
    expect(stderr).toContain('No test files matched under e2e using include')
  })

  it('stays silent on zero files with --quiet (exit code only)', async () => {
    const { stdout, stderr, exitCode } = await runAnalyze(['--quiet', 'nope/**'])
    expect(exitCode).toBe(2)
    expect(stdout).toBe('')
    expect(stderr).toBe('')
  })

  it('still emits the JSON envelope (with the warning) before exiting on zero files', async () => {
    const { stdout, exitCode } = await runAnalyze(['--json', 'nope/**'])
    expect(exitCode).toBe(2)
    const report = JSON.parse(stdout)
    expect(report.summary.filesAnalyzed).toBe(0)
    expect(report.warnings).toEqual([{ code: 'no-files-matched', message: expect.any(String) }])
  })

  it('still writes the SARIF file before exiting on zero files (upload-sarif if: always())', async () => {
    const { exitCode } = await runAnalyze([
      '--reporter',
      'sarif',
      '--output',
      'out.sarif',
      'nope/**',
    ])
    expect(exitCode).toBe(2)
    const sarif = JSON.parse(readFileSync(join(dir, 'out.sarif'), 'utf8'))
    expect(sarif.runs[0].results).toEqual([])
  })

  it('refuses to record an empty baseline on zero files', async () => {
    const { exitCode } = await runAnalyze(['--baseline', 'b.json', '--update-baseline', 'nope/**'])
    expect(exitCode).toBe(2)
    expect(existsSync(join(dir, 'b.json'))).toBe(false)
  })

  it('analyzes a plain JavaScript suite out of the box', async () => {
    writeFileSync(join(dir, 'tests', 'b.spec.js'), 'page.waitForTimeout(1000)\n')
    const { stdout, exitCode } = await runAnalyze(['--json'])
    expect(exitCode).toBeUndefined()
    const report = JSON.parse(stdout)
    expect(report.summary.filesAnalyzed).toBe(2)
    expect(report.findings.map((f: { ruleId: string }) => f.ruleId)).toContain('no-hard-wait')
  })

  it('finds a suite the built-in globs would miss, via playwright.config.ts', async () => {
    // The cal.com / immich shape: `*.e2e.ts` under `e2e/`, no testpilot.config.ts.
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    writeFileSync(
      join(dir, 'playwright.config.ts'),
      "export default { testDir: 'e2e', testMatch: '**/*.e2e.ts' }\n",
    )
    mkdirSync(join(dir, 'e2e'))
    writeFileSync(join(dir, 'e2e', 'login.e2e.ts'), "page.locator('//button')\n")

    const { stdout, exitCode } = await runAnalyze(['--json'])
    expect(exitCode).toBeUndefined()
    const report = JSON.parse(stdout)
    expect(report.summary.filesAnalyzed).toBe(1)
    expect(report.findings[0].file).toBe('e2e/login.e2e.ts')
    expect(report.discovery).toEqual({
      testDir: 'playwright-config',
      include: 'playwright-config',
      exclude: 'default',
      roots: [join(dir, 'e2e')],
      playwrightConfigPath: join(dir, 'playwright.config.ts'),
      playwrightConfigIgnored: null,
      playwrightConfigPartial: null,
      playwrightConfigDeclaresTags: false,
      playwrightTestIdAttribute: null,
    })
  })

  it('reports built-in defaults in the envelope when nothing else supplied them', async () => {
    const { stdout } = await runAnalyze(['--json'])
    expect(JSON.parse(stdout).discovery).toEqual({
      testDir: 'default',
      include: 'default',
      exclude: 'default',
      roots: [join(dir, 'tests')],
      playwrightConfigPath: null,
      playwrightConfigIgnored: null,
      playwrightConfigPartial: null,
      playwrightConfigDeclaresTags: false,
      playwrightTestIdAttribute: null,
    })
  })

  it('explains where discovery settings came from under --verbose', async () => {
    const { stderr } = await runAnalyze(['--verbose'])
    expect(stderr).toContain('discovery: testDir "tests" (built-in default)')
    expect(stderr).toContain('(built-in default)')
  })

  it("says on stderr when another tool's config chose the files", async () => {
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    writeFileSync(
      join(dir, 'playwright.config.ts'),
      "export default { testDir: 'e2e', testMatch: '**/*.e2e.ts' }\n",
    )
    mkdirSync(join(dir, 'e2e'))
    writeFileSync(join(dir, 'e2e', 'a.e2e.ts'), "page.locator('//button')\n")
    const { stderr, exitCode } = await runAnalyze([])
    expect(exitCode).toBeUndefined()
    expect(stderr).toContain('Scanning e2e from')
    expect(stderr).toContain('playwright.config.ts')
  })

  it('can be told not to consult the Playwright config', async () => {
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    writeFileSync(join(dir, 'playwright.config.ts'), "export default { testDir: 'e2e' }\n")
    mkdirSync(join(dir, 'e2e'))
    const { stdout } = await runAnalyze(['--json', '--no-playwright-discovery'])
    const report = JSON.parse(stdout)
    expect(report.discovery.testDir).toBe('default')
    expect(report.summary.filesAnalyzed).toBe(1) // the original tests/a.spec.ts
  })

  it('names the Playwright config it could not use when nothing matched', async () => {
    rmSync(join(dir, 'tests'), { recursive: true, force: true })
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    writeFileSync(
      join(dir, 'playwright.config.ts'),
      "export default { testDir: process.env.DIR ?? 'e2e' }\n",
    )
    const { stderr, exitCode } = await runAnalyze([])
    expect(exitCode).toBe(3)
    expect(stderr).toContain('but not used for discovery')
    expect(stderr).toContain('not a literal value')
  })

  it('never analyzes node_modules, even when the config replaces exclude', async () => {
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    writeFileSync(
      join(dir, 'testpilot.config.ts'),
      "export default { testDir: '.', exclude: ['**/nope/**'] }\n",
    )
    mkdirSync(join(dir, 'node_modules', 'dep'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'dep', 'a.spec.ts'), "page.locator('//button')\n")
    const { stdout } = await runAnalyze(['--json'])
    const report = JSON.parse(stdout)
    expect(report.findings.every((f: { file: string }) => !f.file.includes('node_modules'))).toBe(
      true,
    )
  })

  it('keeps rootDir stable and emits a file URI when a Playwright testDir escapes it', async () => {
    // `rootDir` must stay a pure function of repo layout: deriving it from the
    // scanned roots made baseline identities shift whenever a config gained an
    // unrelated project. A file outside the project is reported honestly with `..`,
    // and SARIF — where `..` is rejected by code scanning — falls back to a file URI.
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    mkdirSync(join(dir, 'repo'), { recursive: true })
    mkdirSync(join(dir, 'shared'), { recursive: true })
    writeFileSync(join(dir, 'shared', 'a.spec.ts'), "page.locator('//button')\n")
    writeFileSync(
      join(dir, 'repo', 'playwright.config.ts'),
      "export default { testDir: '../shared' }\n",
    )
    writeFileSync(join(dir, 'repo', 'package.json'), '{"name":"inner"}\n')

    const { stdout } = await runAnalyze(['--json', '--cwd', join(dir, 'repo')])
    const report = JSON.parse(stdout)
    expect(report.rootDir).toBe(join(dir, 'repo'))
    expect(report.findings[0].file).toBe('../shared/a.spec.ts')

    const sarifRun = await runAnalyze(['--reporter', 'sarif', '--cwd', join(dir, 'repo')])
    const uri = JSON.parse(sarifRun.stdout).runs[0].results[0].locations[0].physicalLocation
      .artifactLocation.uri
    expect(uri.startsWith('file://')).toBe(true)
    expect(uri).not.toContain('/../')
  })

  it('keeps baseline identities stable when an unrelated project root is added', async () => {
    // Adding a project that scans elsewhere must not rewrite existing findings'
    // paths — that turned every baselined finding into a regression.
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    mkdirSync(join(dir, 'e2e'), { recursive: true })
    writeFileSync(join(dir, 'e2e', 'a.spec.ts'), "page.locator('//button')\n")
    const pw = join(dir, 'playwright.config.ts')
    writeFileSync(pw, "export default { projects: [{ testDir: './e2e' }] }\n")
    const before = JSON.parse((await runAnalyze(['--json'])).stdout).findings[0].file

    mkdirSync(join(dir, 'legacy'), { recursive: true })
    writeFileSync(join(dir, 'legacy', 'b.spec.ts'), "page.locator('//a')\n")
    writeFileSync(
      pw,
      "export default { projects: [{ testDir: './e2e' }, { testDir: './legacy' }] }\n",
    )
    const after = JSON.parse((await runAnalyze(['--json'])).stdout)
    expect(after.findings.map((f: { file: string }) => f.file)).toContain(before)
    expect(before).toBe('e2e/a.spec.ts')
  })

  it('names the scanned roots and their source in the human report', async () => {
    // The success path needs disclosure too: an adoption that is wrong but unflagged
    // is invisible if we only speak up when something went wrong.
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    writeFileSync(join(dir, 'playwright.config.ts'), "export default { testDir: './e2e' }\n")
    mkdirSync(join(dir, 'e2e'), { recursive: true })
    writeFileSync(join(dir, 'e2e', 'a.spec.ts'), "page.locator('//button')\n")
    const { stdout } = await runAnalyze([])
    expect(stdout).toContain('Scanned')
    expect(stdout).toContain('playwright.config.ts')
  })

  it('warns when a declared test root does not exist', async () => {
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    writeFileSync(
      join(dir, 'playwright.config.ts'),
      "export default { projects: [{ testDir: './e2e' }, { testDir: './e2e-api' }] }\n",
    )
    mkdirSync(join(dir, 'e2e'), { recursive: true })
    writeFileSync(join(dir, 'e2e', 'a.spec.ts'), "page.getByRole('button')\n")
    const { stdout } = await runAnalyze(['--json'])
    const report = JSON.parse(stdout)
    // Scoring a clean grade over half the declared roots is a partial scan.
    expect(report.warnings.map((w: { code: string }) => w.code)).toContain('test-root-missing')
  })

  it('does not let --with-helpers rescue a run that found no tests', async () => {
    // A wrong testDir must stay a hard failure; scoring the helper layer alone would
    // turn the red gate this tool exists for back into a green one.
    rmSync(join(dir, 'tests'), { recursive: true, force: true })
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    mkdirSync(join(dir, 'fixtures'), { recursive: true })
    writeFileSync(
      join(dir, 'fixtures', 'f.ts'),
      "import type { Page } from '@playwright/test'\nexport const f = (p: Page) => p.locator('.bad')\n",
    )
    const { exitCode } = await runAnalyze(['--with-helpers'])
    expect(exitCode).toBe(3)
  })

  it('marks helper findings in the human report', async () => {
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    writeFileSync(join(dir, 'playwright.config.ts'), "export default { testDir: './tests' }\n")
    mkdirSync(join(dir, 'helpers'), { recursive: true })
    writeFileSync(
      join(dir, 'helpers', 'po.ts'),
      "import type { Page } from '@playwright/test'\nexport const f = (p: Page) => p.locator('.bad')\n",
    )
    const { stdout } = await runAnalyze(['--with-helpers'])
    expect(stdout).toContain('[helper]')
    expect(stdout).toContain('page object/helper file(s)')
  })

  it('says the helper layer went unmeasured, rather than scoring the tests in silence', async () => {
    // Ghost scores 98 A over 95 of its 768 call sites. The number is not wrong; it is
    // about the wrong files, and the report has to say which.
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    writeFileSync(join(dir, 'playwright.config.ts'), "export default { testDir: './tests' }\n")
    mkdirSync(join(dir, 'page-objects'), { recursive: true })
    writeFileSync(
      join(dir, 'page-objects', 'login.ts'),
      "import type { Page } from '@playwright/test'\nexport const f = (p: Page) => p.locator('.bad')\n",
    )
    const { stdout } = await runAnalyze(['--json'])
    const report = JSON.parse(stdout)
    expect(report.warnings.map((w: { code: string }) => w.code)).toContain('helpers-not-analyzed')

    // Silent once you have asked for them.
    const withHelpers = JSON.parse((await runAnalyze(['--json', '--with-helpers'])).stdout)
    expect(withHelpers.warnings.map((w: { code: string }) => w.code)).not.toContain(
      'helpers-not-analyzed',
    )
  })

  it('cannot let a non-Playwright helper raise the score or flip the gate', async () => {
    // Twice now the gate admitted files that produce no findings but add call sites —
    // the score's denominator — turning a failing --min-score into a passing one.
    // This is the assertion that catches it whatever the next false-positive shape is.
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    writeFileSync(join(dir, 'playwright.config.ts'), "export default { testDir: './tests' }\n")
    writeFileSync(
      join(dir, 'tests', 'a.spec.ts'),
      "page.locator('//button')\npage.locator('.cls')\npage.waitForTimeout(9)\n",
    )
    mkdirSync(join(dir, 'helpers'), { recursive: true })
    writeFileSync(
      join(dir, 'helpers', 'render.tsx'),
      "import { screen } from '@testing-library/react'\nexport const t = () => screen.getByRole('heading')\nexport const u = () => screen.getByText('x')\n",
    )

    const plain = JSON.parse((await runAnalyze(['--json'])).stdout)
    const withHelpers = JSON.parse((await runAnalyze(['--json', '--with-helpers'])).stdout)
    expect(withHelpers.score.callSites).toBe(plain.score.callSites)
    expect(withHelpers.score.score).toBe(plain.score.score)

    const gate = await runAnalyze(['--min-score', '50'])
    const gateWithHelpers = await runAnalyze(['--min-score', '50', '--with-helpers'])
    expect(gateWithHelpers.exitCode).toBe(gate.exitCode)
  })

  it('analyzes the page objects a relative includeHelpers entry names (B2)', async () => {
    // `pages/**` was matched against absolute paths, so it matched nothing: naming your
    // page objects, the documented opt-in, analyzed none of them, and adding
    // --with-helpers still scored the tests alone while the report said "Add
    // --with-helpers".
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    writeFileSync(
      join(dir, 'testpilot.config.ts'),
      "export default { testDir: 'tests', includeHelpers: ['pages/**'] }\n",
    )
    mkdirSync(join(dir, 'pages'), { recursive: true })
    writeFileSync(
      join(dir, 'pages', 'login.ts'),
      "import type { Page } from '@playwright/test'\nexport const f = (p: Page) => p.locator('.bad')\n",
    )
    for (const extra of [[], ['--with-helpers']]) {
      const report = JSON.parse((await runAnalyze(['--json', ...extra])).stdout)
      expect(report.summary.helperFiles, extra.join(' ')).toBe(1)
      expect(report.findings.some((f: { inHelper?: boolean }) => f.inHelper)).toBe(true)
      const codes = report.warnings.map((w: { code: string }) => w.code)
      expect(codes).not.toContain('helpers-not-analyzed')
      expect(codes).not.toContain('include-helpers-unmatched')
    }
  })

  it('names an includeHelpers entry that matched no file', async () => {
    // A typo'd entry looked exactly like a project with no page objects.
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    writeFileSync(
      join(dir, 'testpilot.config.ts'),
      "export default { testDir: 'tests', includeHelpers: ['pages/**', 'page-objetcs/**'] }\n",
    )
    mkdirSync(join(dir, 'pages'), { recursive: true })
    writeFileSync(
      join(dir, 'pages', 'login.ts'),
      "import type { Page } from '@playwright/test'\nexport const f = (p: Page) => p.locator('.bad')\n",
    )
    const report = JSON.parse((await runAnalyze(['--json'])).stdout)
    const unmatched = report.warnings.filter(
      (w: { code: string }) => w.code === 'include-helpers-unmatched',
    )
    expect(unmatched).toHaveLength(1)
    expect(unmatched[0].message).toContain('page-objetcs/**')
    expect(unmatched[0].message).not.toContain('`pages/**`')
  })

  describe('includeHelpers resolves from the testpilot config directory, and only there', () => {
    const PO =
      "import type { Page } from '@playwright/test'\nexport const f = (p: Page) => p.locator('.bad')\n"
    const put = (path: string, content = PO) => {
      mkdirSync(join(dir, path, '..'), { recursive: true })
      writeFileSync(join(dir, path), content)
    }
    const helperFiles = (report: { findings: { file: string; inHelper?: boolean }[] }) =>
      [...new Set(report.findings.filter((f) => f.inHelper).map((f) => f.file))].sort()
    const codes = (report: { warnings: { code: string }[] }) => report.warnings.map((w) => w.code)

    it('means the root pages/ even when discovery adopts e2e/playwright.config.ts', async () => {
      // Matched against two roots, `pages/**` meant `e2e/pages` here and missed the
      // directory the user wrote it for, then reported the entry as a typo.
      rmSync(join(dir, 'tests'), { recursive: true, force: true })
      writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
      writeFileSync(
        join(dir, 'testpilot.config.ts'),
        "export default { includeHelpers: ['pages/**'] }\n",
      )
      put('e2e/playwright.config.ts', "export default { testDir: './tests' }\n")
      put('e2e/tests/a.spec.ts', "page.locator('//button')\n")
      put('pages/login.ts')
      put('e2e/pages/inner.ts')
      const report = JSON.parse((await runAnalyze(['--json'])).stdout)
      expect(report.discovery.testDir).toBe('playwright-config')
      expect(report.rootDir).toBe(dir)
      expect(helperFiles(report)).toEqual(['pages/login.ts'])
      expect(codes(report)).not.toContain('include-helpers-unmatched')
    })

    it('treats ! entries as exclusions, not as "match everything"', async () => {
      writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
      writeFileSync(
        join(dir, 'testpilot.config.ts'),
        "export default { testDir: 'tests', includeHelpers: ['pages/**', '!pages/legacy/**'] }\n",
      )
      put('pages/login.ts')
      put('pages/legacy/old.ts')
      put('tools/setup.ts')
      const report = JSON.parse((await runAnalyze(['--json'])).stdout)
      expect(helperFiles(report)).toEqual(['pages/login.ts'])
      expect(codes(report)).not.toContain('include-helpers-unmatched')
    })

    it('admits only source files from a named glob', async () => {
      // `pages/**` selected every file type: a NOTES.md quoting `page.locator('text=Save')`
      // passed the Playwright sniff, produced a [helper] finding, and `fix` offered to
      // rewrite it; images and JSON inflated helpers-not-recognized.
      writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
      writeFileSync(
        join(dir, 'testpilot.config.ts'),
        "export default { testDir: 'tests', includeHelpers: ['pages/**', 'docs/**'] }\n",
      )
      put('pages/login.ts')
      put('pages/NOTES.md', "page.locator('text=Save').click()\n")
      put('pages/data.json', '{"a":1}\n')
      put('docs/guide.md', "page.locator('.x')\n")
      const report = JSON.parse((await runAnalyze(['--json'])).stdout)
      expect(helperFiles(report)).toEqual(['pages/login.ts'])
      expect(report.parseErrors).toEqual([])
      expect(codes(report)).not.toContain('helpers-not-recognized')
      // `docs/**` holds no source file, so it added nothing: say so.
      const unmatched = report.warnings.find(
        (w: { code: string }) => w.code === 'include-helpers-unmatched',
      )
      expect(unmatched?.message).toContain('docs/**')
      expect(unmatched?.message).not.toContain('pages/**')
      const fix = JSON.parse((await runCli(['fix', '--cwd', dir, '--json'])).stdout)
      expect(fix.files.map((f: { file: string }) => f.file)).not.toContain('pages/NOTES.md')
    })

    it('reads a bare directory entry as everything under it', async () => {
      writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
      writeFileSync(
        join(dir, 'testpilot.config.ts'),
        "export default { testDir: 'tests', includeHelpers: ['pages', 'objects/'] }\n",
      )
      put('pages/login.ts')
      put('objects/cart.ts')
      const report = JSON.parse((await runAnalyze(['--json'])).stdout)
      expect(helperFiles(report)).toEqual(['objects/cart.ts', 'pages/login.ts'])
      expect(codes(report)).not.toContain('include-helpers-unmatched')
    })

    it('never analyzes — or lets fix rewrite — a ../ entry outside the project', async () => {
      const app = join(dir, 'app')
      mkdirSync(join(app, 'tests'), { recursive: true })
      writeFileSync(join(app, 'package.json'), '{"name":"app"}\n')
      writeFileSync(join(app, 'tests', 'a.spec.ts'), "page.locator('//button')\n")
      writeFileSync(
        join(app, 'testpilot.config.ts'),
        "export default { testDir: 'tests', includeHelpers: ['../shared/**'] }\n",
      )
      put(
        'shared/po.ts',
        "export const f = (p: any) => p.locator('text=Save')\nimport '@playwright/test'\n",
      )
      const report = JSON.parse((await runCli(['analyze', '--cwd', app, '--json'])).stdout)
      expect(helperFiles(report)).toEqual([])
      expect(codes(report)).toContain('helpers-not-recognized')
      const fix = JSON.parse((await runCli(['fix', '--cwd', app, '--json'])).stdout)
      expect(fix.files.map((f: { file: string }) => f.file)).not.toContain('../shared/po.ts')
    })

    it('does not report an entry whose files exclude removed as misspelt', async () => {
      writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
      writeFileSync(
        join(dir, 'testpilot.config.ts'),
        "export default { testDir: 'tests', includeHelpers: ['pages/**'], exclude: ['**/pages/**'] }\n",
      )
      put('pages/login.ts')
      const report = JSON.parse((await runAnalyze(['--json'])).stdout)
      expect(codes(report)).not.toContain('include-helpers-unmatched')
    })

    it('tells a named-list user to extend the list, not to pass a flag that changes nothing', async () => {
      writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
      writeFileSync(
        join(dir, 'testpilot.config.ts'),
        "export default { testDir: 'tests', includeHelpers: ['pages/**'] }\n",
      )
      put('pages/login.ts')
      put('fixtures/base.ts')
      for (const extra of [[], ['--with-helpers']]) {
        const report = JSON.parse((await runAnalyze(['--json', ...extra])).stdout)
        const warning = report.warnings.find(
          (w: { code: string }) => w.code === 'helpers-not-analyzed',
        )
        expect(warning?.message).toContain('includeHelpers')
        expect(warning?.message).not.toContain('Add --with-helpers')
      }
    })

    it('keeps page objects a named list admits out of the tag vocabulary', async () => {
      writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
      writeFileSync(
        join(dir, 'testpilot.config.ts'),
        "export default { testDir: 'tests', includeHelpers: ['pages/**'] }\n",
      )
      writeFileSync(
        join(dir, 'tests', 'a.spec.ts'),
        "import { test } from '@playwright/test'\ntest('x', { tag: '@smoke' }, async () => {})\n",
      )
      put('pages/login.ts')
      const tags = JSON.parse((await runCli(['tags', '--cwd', dir, '--json'])).stdout)
      expect(tags.summary.filesAnalyzed).toBe(1)
      expect(tags.warnings.map((w: { code: string }) => w.code)).not.toContain(
        'no-tests-recognized',
      )
    })

    it('shows fix the same unmatched-entry warning analyze does', async () => {
      writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
      writeFileSync(
        join(dir, 'testpilot.config.ts'),
        "export default { testDir: 'tests', includeHelpers: ['pags/**'] }\n",
      )
      const fix = JSON.parse((await runCli(['fix', '--cwd', dir, '--json'])).stdout)
      expect(fix.warnings.map((w: { code: string }) => w.code)).toContain(
        'include-helpers-unmatched',
      )
    })

    it('does not treat a checkout under a directory called fixtures/ as all page objects', async () => {
      // The conventional names were also tested against the absolute path.
      const project = join(dir, 'fixtures', 'proj')
      mkdirSync(join(project, 'tests'), { recursive: true })
      writeFileSync(join(project, 'package.json'), '{"name":"proj"}\n')
      writeFileSync(join(project, 'tests', 'a.spec.ts'), "page.locator('//button')\n")
      writeFileSync(
        join(project, 'playwright.config.ts'),
        "export default { testDir: './tests' }\n",
      )
      mkdirSync(join(project, 'tools'), { recursive: true })
      writeFileSync(join(project, 'tools', 'global-setup.ts'), PO)
      const report = JSON.parse(
        (await runCli(['analyze', '--cwd', project, '--json', '--with-helpers'])).stdout,
      )
      expect(helperFiles(report)).toEqual([])
      expect(codes(report)).not.toContain('helpers-not-analyzed')
    })
  })

  it('says so when helper directories matched but nothing in them uses Playwright', async () => {
    // Silence here is indistinguishable from "you have no page objects", which is how
    // a gate that rejected every real page-object shape went unnoticed.
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    writeFileSync(join(dir, 'playwright.config.ts'), "export default { testDir: './tests' }\n")
    mkdirSync(join(dir, 'helpers'), { recursive: true })
    writeFileSync(join(dir, 'helpers', 'date.js'), 'export const f = (d) => d.toISOString()\n')
    const { stdout } = await runAnalyze(['--with-helpers', '--json'])
    const report = JSON.parse(stdout)
    expect(report.warnings.map((w: { code: string }) => w.code)).toContain('helpers-not-recognized')
  })

  it('says --with-helpers is ignored rather than silently ignoring it', async () => {
    const { stderr } = await runAnalyze(['--with-helpers', 'tests/**/*.spec.ts'])
    expect(stderr).toContain('--with-helpers is ignored')
  })

  it('analyzes an explicitly named file inside an excluded directory', async () => {
    mkdirSync(join(dir, 'dist', 'e2e'), { recursive: true })
    writeFileSync(join(dir, 'dist', 'e2e', 'a.spec.js'), "page.locator('//button')\n")
    const { stdout, exitCode } = await runAnalyze(['--json', 'dist/e2e/a.spec.js'])
    expect(exitCode).toBeUndefined()
    expect(JSON.parse(stdout).summary.filesAnalyzed).toBe(1)
  })

  it('anchors at the project root when there is no config file (matching doctor)', async () => {
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    mkdirSync(join(dir, 'src', 'deep'), { recursive: true })
    const { stdout, exitCode } = await runAnalyze(['--json', '--cwd', join(dir, 'src', 'deep')])
    expect(exitCode).toBeUndefined()
    expect(JSON.parse(stdout).summary.filesAnalyzed).toBe(1)
  })

  it('finds the suite via the config file directory when run from a sub-directory', async () => {
    writeFileSync(join(dir, 'testpilot.config.ts'), "export default { testDir: 'tests' }\n")
    mkdirSync(join(dir, 'src', 'deep'), { recursive: true })
    const { stdout, exitCode } = await runAnalyze(['--json', '--cwd', join(dir, 'src', 'deep')])
    expect(exitCode).toBeUndefined()
    const report = JSON.parse(stdout)
    expect(report.summary.filesAnalyzed).toBe(1)
    expect(report.findings[0].file).toBe('tests/a.spec.ts')
    expect(report.rootDir).toBe(dir)
  })

  it('reports an absolute rootDir even when --cwd is relative', async () => {
    const previous = process.cwd()
    process.chdir(dir)
    try {
      const { stdout } = await runAnalyze(['--json', '--cwd', '.'])
      expect(isAbsolute(JSON.parse(stdout).rootDir)).toBe(true)
    } finally {
      process.chdir(previous)
    }
  })

  it('keeps SARIF URIs relative to --cwd (the Action contract) when the config lives elsewhere', async () => {
    writeFileSync(join(dir, 'testpilot.config.ts'), "export default { testDir: 'tests' }\n")
    mkdirSync(join(dir, 'src', 'deep'), { recursive: true })
    const { stdout, exitCode } = await runAnalyze([
      '--reporter',
      'sarif',
      '--cwd',
      join(dir, 'src', 'deep'),
    ])
    expect(exitCode).toBeUndefined()
    const sarif = JSON.parse(stdout)
    expect(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe(
      '../../tests/a.spec.ts',
    )
  })
})

describe('analyze --output', () => {
  it('writes the JSON report to a file and confirms on stdout', async () => {
    const out = join(dir, 'report.json')
    const { stdout } = await runAnalyze(['--output', out])
    expect(stdout).toContain('Report written to')
    const report = JSON.parse(readFileSync(out, 'utf8'))
    expect(report.command).toBe('analyze')
    expect(report.findings.some((f: { ruleId: string }) => f.ruleId === 'no-xpath')).toBe(true)
  })

  it('fails clearly (exit 2) when the output path cannot be written', async () => {
    // Make the parent a file so the directory cannot be created.
    writeFileSync(join(dir, 'blocker'), 'x')
    const { exitCode, stderr } = await runAnalyze(['--output', join(dir, 'blocker', 'report.json')])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('Could not write')
  })
})

describe('analyze --reporter', () => {
  it('rejects an unknown reporter (exit 2)', async () => {
    const { exitCode, stderr } = await runAnalyze(['--reporter', 'xml'])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('--reporter must be one of')
  })

  it('prints SARIF to stdout with --reporter sarif', async () => {
    const { stdout } = await runAnalyze(['--reporter', 'sarif'])
    const sarif = JSON.parse(stdout)
    expect(sarif.version).toBe('2.1.0')
    expect(sarif.runs[0].results.some((r: { ruleId: string }) => r.ruleId === 'no-xpath')).toBe(
      true,
    )
  })

  it('writes a parseable SARIF file with --reporter sarif --output', async () => {
    const out = join(dir, 'tp.sarif')
    const { stdout } = await runAnalyze(['--reporter', 'sarif', '--output', out])
    expect(stdout).toContain('Report written to')
    const sarif = JSON.parse(readFileSync(out, 'utf8'))
    expect(sarif.version).toBe('2.1.0')
    const result = sarif.runs[0].results.find((r: { ruleId: string }) => r.ruleId === 'no-xpath')
    expect(result.locations[0].physicalLocation.artifactLocation.uri).toContain('a.spec.ts')
  })

  it('writes the human report to a file with --reporter table --output', async () => {
    const out = join(dir, 'report.txt')
    await runAnalyze(['--reporter', 'table', '--output', out])
    const text = readFileSync(out, 'utf8')
    expect(text).toContain('Locator Quality Score')
    expect(text).toContain('no-xpath')
  })

  it('writes a self-contained HTML report with --reporter html --output', async () => {
    const out = join(dir, 'report.html')
    const { stdout } = await runAnalyze(['--reporter', 'html', '--output', out])
    expect(stdout).toContain('Report written to')
    const html = readFileSync(out, 'utf8')
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('no-xpath')
    expect(html).toContain('Locator Quality')
    expect(html).not.toMatch(/<script/i)
  })

  it('prints HTML to stdout with --reporter html', async () => {
    const { stdout } = await runAnalyze(['--reporter', 'html'])
    expect(stdout.startsWith('<!doctype html>')).toBe(true)
  })

  it('scopes SARIF to NEW findings when a baseline is active', async () => {
    const baseline = join(dir, 'baseline.json')
    // Record the existing finding (a.spec.ts no-xpath) as accepted.
    await runAnalyze(['--baseline', baseline, '--update-baseline'])
    // Add a brand-new finding in another file.
    writeFileSync(join(dir, 'tests', 'b.spec.ts'), 'page.waitForTimeout(1000)\n')
    const out = join(dir, 'tp.sarif')
    await runAnalyze(['--baseline', baseline, '--reporter', 'sarif', '--output', out])
    const sarif = JSON.parse(readFileSync(out, 'utf8'))
    const ruleIds = sarif.runs[0].results.map((r: { ruleId: string }) => r.ruleId)
    // Only the new no-hard-wait finding is annotated; the baselined no-xpath is not.
    expect(ruleIds).toEqual(['no-hard-wait'])
  })
})

describe('analyze --baseline / --update-baseline', () => {
  const baselinePath = () => join(dir, 'baseline.json')

  it('requires --baseline when --update-baseline is used (exit 2)', async () => {
    const { exitCode, stderr } = await runAnalyze(['--update-baseline'])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('requires --baseline')
  })

  it('errors clearly when the baseline file is missing (exit 2)', async () => {
    const { exitCode, stderr } = await runAnalyze(['--baseline', baselinePath()])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('Baseline file not found')
  })

  it('--update-baseline writes a baseline and does not gate (exit 0)', async () => {
    const { exitCode, stdout } = await runAnalyze([
      '--baseline',
      baselinePath(),
      '--update-baseline',
    ])
    expect(exitCode).toBeUndefined()
    expect(stdout).toContain('Baseline written to')
    const baseline = JSON.parse(readFileSync(baselinePath(), 'utf8'))
    expect(baseline.entries.some((e: { ruleId: string }) => e.ruleId === 'no-xpath')).toBe(true)
  })

  it('passes (exit 0) when there are no new findings vs the baseline', async () => {
    await runAnalyze(['--baseline', baselinePath(), '--update-baseline'])
    const { exitCode, stdout } = await runAnalyze(['--baseline', baselinePath()])
    expect(exitCode).toBeUndefined()
    expect(stdout).toContain('No new findings vs baseline')
  })

  it('fails (exit 1) and lists the regression when a new finding appears', async () => {
    await runAnalyze(['--baseline', baselinePath(), '--update-baseline'])
    // Introduce a brand-new finding in another file.
    writeFileSync(join(dir, 'tests', 'b.spec.ts'), 'page.waitForTimeout(1000)\n')
    const { exitCode, stdout } = await runAnalyze(['--baseline', baselinePath()])
    expect(exitCode).toBe(1)
    expect(stdout).toContain('no-hard-wait')
    expect(stdout).toContain('1 new finding(s) vs baseline')
  })

  it('includes baseline summary in the JSON report', async () => {
    await runAnalyze(['--baseline', baselinePath(), '--update-baseline'])
    const { stdout } = await runAnalyze(['--baseline', baselinePath(), '--json'])
    const report = JSON.parse(stdout)
    expect(report.baseline).toMatchObject({ newFindings: 0 })
    expect(report.baseline.baselinedFindings).toBeGreaterThan(0)
  })

  it('still fails the score gate (exit 1) when the baseline passes', async () => {
    await runAnalyze(['--baseline', baselinePath(), '--update-baseline'])
    // No new findings, but the score is well below 100.
    const { exitCode, stderr } = await runAnalyze([
      '--baseline',
      baselinePath(),
      '--min-score',
      '100',
    ])
    expect(exitCode).toBe(1)
    expect(stderr).toContain('below the required minimum')
  })

  it('reports both gates (exit 1) when score and baseline both fail', async () => {
    await runAnalyze(['--baseline', baselinePath(), '--update-baseline'])
    writeFileSync(join(dir, 'tests', 'b.spec.ts'), 'page.waitForTimeout(1000)\n')
    const { exitCode, stderr } = await runAnalyze([
      '--baseline',
      baselinePath(),
      '--min-score',
      '100',
    ])
    expect(exitCode).toBe(1)
    expect(stderr).toContain('new finding(s) vs baseline')
    expect(stderr).toContain('below the required minimum')
  })

  it('errors (exit 2) on an unparseable baseline file', async () => {
    writeFileSync(baselinePath(), '{ not valid json')
    const { exitCode, stderr } = await runAnalyze(['--baseline', baselinePath()])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('Could not parse baseline file')
  })

  it('errors (exit 2) on a baseline missing its entries array', async () => {
    writeFileSync(baselinePath(), JSON.stringify({ schemaVersion: '1.0' }))
    const { exitCode, stderr } = await runAnalyze(['--baseline', baselinePath()])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('missing an "entries" array')
  })

  it('errors (exit 2) on an unsupported baseline schema version', async () => {
    writeFileSync(baselinePath(), JSON.stringify({ schemaVersion: '0.9', entries: [] }))
    const { exitCode, stderr } = await runAnalyze(['--baseline', baselinePath()])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('Unsupported baseline schema')
  })

  it('errors (exit 2) on a baseline with no schema version', async () => {
    writeFileSync(baselinePath(), JSON.stringify({ entries: [] }))
    const { exitCode, stderr } = await runAnalyze(['--baseline', baselinePath()])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('got none')
  })
})

describe('unscored findings are disclosed where the reader is', () => {
  // This note has been added twice after review; without a test it can be
  // deleted with every gate green.
  beforeEach(() => {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, 'tests', 'b.spec.ts'), "test('untagged', async () => {})\n")
    writeFileSync(
      join(dir, 'testpilot.config.ts'),
      "export default { rules: { 'require-test-tag': 'info' } }\n",
    )
  })

  it('names the exclusion in the table', async () => {
    const { stdout } = await runAnalyze()
    expect(stdout).toContain('not scored')
    expect(stdout).toContain('require-test-tag')
  })

  it('names it in baseline mode too, which is the CI mode', async () => {
    await runAnalyze(['--baseline', 'bl.json', '--update-baseline'])
    const { stdout } = await runAnalyze(['--baseline', 'bl.json'])
    expect(stdout).toContain('not scored')
  })

  it('names it in the HTML report, which is what gets shared', async () => {
    await runAnalyze(['--reporter', 'html', '--output', 'r.html'])
    const html = readFileSync(join(dir, 'r.html'), 'utf8')
    expect(html).toContain('not scored')
    expect(html).toContain('require-test-tag')
  })

  it('says nothing when there is nothing to exclude', async () => {
    rmSync(join(dir, 'testpilot.config.ts'))
    const { stdout } = await runAnalyze()
    expect(stdout).not.toContain('not scored')
  })
})

describe('a baseline recorded before a rule split', () => {
  // The successor map exists so a rule split does not re-report every
  // grandfathered finding as new. Absorbing them *silently* would be the same
  // defect wearing a different hat, so the count is reported.
  beforeEach(() => {
    writeFileSync(
      join(dir, 'tests', 'a.spec.ts'),
      "test('x', async ({ page }) => { await page.getByRole('row').nth(2).click() })\n",
    )
    writeFileSync(
      join(dir, 'bl.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        entries: [
          {
            ruleId: 'no-nth-child',
            file: 'tests/a.spec.ts',
            snippet: "page.getByRole('row').nth(2)",
            count: 1,
          },
        ],
      }),
    )
  })

  it('still passes the gate', async () => {
    const { exitCode, stdout } = await runAnalyze(['--baseline', 'bl.json'])
    expect(exitCode).toBeUndefined()
    expect(stdout).toContain('No new findings vs baseline')
  })

  it('says how many matched under the previous id', async () => {
    const { stdout } = await runAnalyze(['--baseline', 'bl.json'])
    expect(stdout).toContain("matched under a rule's previous id")
  })

  it('names it in the HTML report too, which is the shared artifact', async () => {
    await runAnalyze(['--baseline', 'bl.json', '--reporter', 'html', '--output', 'r.html'])
    expect(readFileSync(join(dir, 'r.html'), 'utf8')).toContain(
      "matched under a rule's previous id",
    )
  })

  it('reports it in JSON too', async () => {
    const { stdout } = await runAnalyze(['--baseline', 'bl.json', '--json'])
    expect(JSON.parse(stdout).baseline.matchedByPreviousId).toBe(1)
  })

  it('says nothing when no id changed', async () => {
    writeFileSync(
      join(dir, 'bl.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        entries: [
          {
            ruleId: 'avoid-positional-access',
            file: 'tests/a.spec.ts',
            snippet: "page.getByRole('row').nth(2)",
            count: 1,
          },
        ],
      }),
    )
    const { stdout } = await runAnalyze(['--baseline', 'bl.json'])
    expect(stdout).not.toContain('previous id')
  })
})

describe('ruleOptions end to end', () => {
  it('threshold from config reaches the rule', async () => {
    writeFileSync(
      join(dir, 'tests', 'a.spec.ts'),
      "test('x', async ({ page }) => { await page.locator('a b c').click() })\n",
    )
    // Distinct config files: the loader is memoized per path within a process,
    // which is right for a one-shot CLI and would make a rewrite invisible here.
    writeFileSync(
      join(dir, 'tight.config.ts'),
      "export default { ruleOptions: { 'no-deep-css-chain': { maxChainDepth: 2 } } }\n",
    )
    writeFileSync(
      join(dir, 'loose.config.ts'),
      "export default { ruleOptions: { 'no-deep-css-chain': { maxChainDepth: 6 } } }\n",
    )
    const fired = async (config: string) =>
      JSON.parse(
        (await runAnalyze(['--json', '--config', join(dir, config)])).stdout,
      ).findings.some((finding: { ruleId: string }) => finding.ruleId === 'no-deep-css-chain')
    expect(await fired('tight.config.ts')).toBe(true)
    expect(await fired('loose.config.ts')).toBe(false)
  })

  it('rejects an out-of-range threshold at config load', async () => {
    writeFileSync(
      join(dir, 'bad.config.ts'),
      "export default { ruleOptions: { 'no-deep-css-chain': { maxChainDepth: 0 } } }\n",
    )
    const { exitCode } = await runAnalyze(['--config', join(dir, 'bad.config.ts')])
    expect(exitCode).toBe(3)
  })
})
