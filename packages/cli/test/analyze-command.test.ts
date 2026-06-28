import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(' '))
  })
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errs.push(args.map(String).join(' '))
  })
  try {
    await buildProgram().parseAsync(['node', 'testpilot', 'analyze', '--cwd', dir, ...extraArgs])
  } finally {
    logSpy.mockRestore()
    errSpy.mockRestore()
  }
  return { stdout: logs.join('\n'), stderr: errs.join('\n') }
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
