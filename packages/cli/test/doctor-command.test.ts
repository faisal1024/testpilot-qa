import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { generateAgentFiles } from '@testpilot/ai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildProgram } from '../src/program.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'testpilot-doctor-cmd-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const PLAYWRIGHT_BIN = process.platform === 'win32' ? 'playwright.cmd' : 'playwright'

function writeHealthyProject(): void {
  writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
  mkdirSync(join(dir, 'node_modules', '.bin'), { recursive: true })
  writeFileSync(join(dir, 'node_modules', '.bin', PLAYWRIGHT_BIN), '')
  writeFileSync(join(dir, 'playwright.config.ts'), 'export default {}\n')
  mkdirSync(join(dir, 'tests'), { recursive: true })
  writeFileSync(join(dir, 'testpilot.config.ts'), "export default { testDir: 'tests' }\n")
  for (const file of generateAgentFiles()) {
    const dest = join(dir, file.path)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, file.content)
  }
}

async function runDoctorCli(extraArgs: string[] = []) {
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
    await buildProgram().parseAsync(['node', 'testpilot', 'doctor', '--cwd', dir, ...extraArgs])
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

describe('doctor command', () => {
  it('prints a human report and exits 0 for a healthy project', async () => {
    writeHealthyProject()
    const { stdout, exitCode } = await runDoctorCli()
    expect(exitCode).toBe(0)
    expect(stdout).toContain('TestPilot Doctor — PASS')
  })

  it('emits stable JSON with --json', async () => {
    writeHealthyProject()
    const { stdout, exitCode } = await runDoctorCli(['--json'])
    expect(exitCode).toBe(0)
    const report = JSON.parse(stdout)
    expect(report.command).toBe('doctor')
    expect(report.status).toBe('pass')
    expect(Array.isArray(report.checks)).toBe(true)
  })

  it('prints nothing with --quiet but keeps the exit code', async () => {
    writeHealthyProject()
    const { stdout, exitCode } = await runDoctorCli(['--quiet'])
    expect(stdout).toBe('')
    expect(exitCode).toBe(0)
  })

  it('exits 4 when Playwright is missing', async () => {
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    writeFileSync(join(dir, 'playwright.config.ts'), 'export default {}\n')
    mkdirSync(join(dir, 'tests'), { recursive: true })
    const { exitCode } = await runDoctorCli()
    expect(exitCode).toBe(4)
  })

  it('exits 3 for an invalid config', async () => {
    writeHealthyProject()
    writeFileSync(
      join(dir, 'testpilot.config.ts'),
      'export default { scoring: { minScore: 999 } }\n',
    )
    const { exitCode } = await runDoctorCli()
    expect(exitCode).toBe(3)
  })

  it('keeps exit code 0 when AI guidance drifts (warning only)', async () => {
    writeHealthyProject()
    rmSync(join(dir, 'CLAUDE.md'))
    const { stdout, exitCode } = await runDoctorCli(['--json'])
    expect(exitCode).toBe(0)
    const report = JSON.parse(stdout)
    expect(report.status).toBe('warn')
    const ai = report.checks.find((c: { id: string }) => c.id === 'ai-guidance')
    expect(ai.status).toBe('warn')
    expect(ai.details.files.find((f: { agent: string }) => f.agent === 'claude').state).toBe(
      'missing',
    )
  })
})
