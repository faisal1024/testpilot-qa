import { describe, expect, it, vi } from 'vitest'
import { buildProgram } from '../src/program.js'

/** Runs `testpilot explain <argv>` capturing stdout/stderr/exit without a subprocess. */
async function runExplain(argv: string[]) {
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
    await buildProgram().parseAsync(['node', 'testpilot', 'explain', ...argv])
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

describe('explain command', () => {
  it('prints a human explanation for a known rule', async () => {
    const { stdout, exitCode } = await runExplain(['no-xpath'])
    expect(exitCode).toBeUndefined()
    expect(stdout).toContain('no-xpath  [error] locator')
    expect(stdout).toContain('Why it matters')
    expect(stdout).toContain(
      'Docs: https://github.com/faisal1024/testpilot-qa/blob/main/docs/rules/no-xpath.md',
    )
  })

  it('emits JSON with --json', async () => {
    const { stdout } = await runExplain(['no-xpath', '--json'])
    expect(JSON.parse(stdout).id).toBe('no-xpath')
  })

  it('prints nothing for a known rule with --quiet', async () => {
    const { stdout, stderr, exitCode } = await runExplain(['no-xpath', '--quiet'])
    expect(stdout).toBe('')
    expect(stderr).toBe('')
    expect(exitCode).toBeUndefined()
  })

  it('still emits JSON with --quiet --json (json wins)', async () => {
    const { stdout } = await runExplain(['no-xpath', '--quiet', '--json'])
    expect(JSON.parse(stdout).id).toBe('no-xpath')
  })

  it('exits 2 and lists available rules for an unknown rule', async () => {
    const { stderr, exitCode } = await runExplain(['made-up-rule'])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('Unknown rule "made-up-rule"')
    expect(stderr).toContain('no-xpath')
  })
})
