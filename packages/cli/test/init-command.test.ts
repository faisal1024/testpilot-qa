import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildProgram } from '../src/program.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'testpilot-init-cmd-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

async function runInit(extraArgs: string[] = []) {
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
    await buildProgram().parseAsync([
      'node',
      'testpilot',
      'init',
      'demo',
      '--yes',
      '--json',
      '--cwd',
      dir,
      ...extraArgs,
    ])
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

describe('init command', () => {
  it('generates all agent guidance files by default', async () => {
    const { stdout } = await runInit()
    const created: string[] = JSON.parse(stdout).created
    expect(created).toEqual(
      expect.arrayContaining([
        'CLAUDE.md',
        'AGENTS.md',
        '.cursor/rules/testpilot-playwright.mdc',
        '.github/copilot-instructions.md',
      ]),
    )
  })

  it('honors config.ai.agents when selecting guidance files', async () => {
    writeFileSync(
      join(dir, 'testpilot.config.ts'),
      "export default { ai: { agents: ['claude'] } }\n",
    )
    const { stdout } = await runInit()
    const created: string[] = JSON.parse(stdout).created
    expect(created).toContain('CLAUDE.md')
    expect(created).not.toContain('AGENTS.md')
    expect(created).not.toContain('.github/copilot-instructions.md')
    expect(existsSync(join(dir, 'demo', 'AGENTS.md'))).toBe(false)
  })

  it('exits 3 for an invalid config', async () => {
    writeFileSync(join(dir, 'testpilot.config.ts'), "export default { ai: { agents: ['nope'] } }\n")
    const { exitCode } = await runInit()
    expect(exitCode).toBe(3)
  })
})
