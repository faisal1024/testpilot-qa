import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
})
