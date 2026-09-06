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
    await buildProgram().parseAsync(['node', 'testpilot', 'analyze', '--cwd', dir, ...extraArgs])
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
    })
  })

  it('explains where discovery settings came from under --verbose', async () => {
    const { stderr } = await runAnalyze(['--verbose'])
    expect(stderr).toContain('discovery: testDir "tests" (built-in default)')
    expect(stderr).toContain('include (built-in default)')
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

  it('keeps reported paths inside rootDir when a Playwright testDir escapes it', async () => {
    // A sub-directory config with `testDir: '../shared'` would otherwise emit `../`
    // SARIF URIs, which GitHub code scanning rejects.
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
    expect(report.summary.filesAnalyzed).toBe(1)
    expect(report.findings[0].file).not.toContain('..')
    expect(report.findings[0].file).toBe('shared/a.spec.ts')
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
