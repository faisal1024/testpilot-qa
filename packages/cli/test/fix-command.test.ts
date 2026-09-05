import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildProgram } from '../src/program.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'testpilot-fix-'))
  mkdirSync(join(dir, 'tests'), { recursive: true })
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function writeSpec(name: string, contents: string): string {
  const path = join(dir, 'tests', name)
  writeFileSync(path, contents)
  return path
}

async function runFix(args: string[] = [], globals: string[] = []) {
  const logs: string[] = []
  const errs: string[] = []
  let exitCode: number | undefined
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.map(String).join(' '))
  })
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errs.push(a.map(String).join(' '))
  })
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCode = code
    throw new Error('__exit__')
  }) as never)
  try {
    await buildProgram().parseAsync(['node', 'testpilot', '--cwd', dir, ...globals, 'fix', ...args])
  } catch (error) {
    if (!(error instanceof Error) || error.message !== '__exit__') throw error
  } finally {
    logSpy.mockRestore()
    errSpy.mockRestore()
    exitSpy.mockRestore()
  }
  return { stdout: logs.join('\n'), stderr: errs.join('\n'), exitCode }
}

describe('fix — dry run (default)', () => {
  it('shows a unified diff and writes nothing', async () => {
    const path = writeSpec('a.spec.ts', "await page.locator('text=Submit').click()\n")
    const { stdout, exitCode } = await runFix()
    expect(exitCode).toBeUndefined()
    expect(stdout).toContain('--- a/')
    expect(stdout).toContain("-await page.locator('text=Submit').click()")
    expect(stdout).toContain("+await page.getByText('Submit').click()")
    expect(stdout).toContain('Re-run with --write')
    // File is untouched.
    expect(readFileSync(path, 'utf8')).toBe("await page.locator('text=Submit').click()\n")
  })

  it('reports when there is nothing to fix', async () => {
    writeSpec('a.spec.ts', "await page.getByRole('button').click()\n")
    const { stdout } = await runFix()
    expect(stdout).toContain('No mechanical fixes available.')
  })
})

describe('fix — nothing matched', () => {
  it('exits 3 instead of reporting "nothing to fix" when no files match', async () => {
    const { stderr, exitCode } = await runFix()
    expect(exitCode).toBe(3)
    expect(stderr).toContain('No test files matched')
  })
})

describe('fix --write', () => {
  it('applies the fix and is idempotent on a second run', async () => {
    const path = writeSpec('a.spec.ts', "await page.locator('text=Save').click()\n")
    const first = await runFix(['--write'])
    expect(first.stdout).toContain('Applied 1 fix(es)')
    expect(readFileSync(path, 'utf8')).toBe("await page.getByText('Save').click()\n")

    const second = await runFix(['--write'])
    expect(second.stdout).toContain('No mechanical fixes available.')
    expect(readFileSync(path, 'utf8')).toBe("await page.getByText('Save').click()\n")
  })

  it('does not rewrite unsupported selectors', async () => {
    const original =
      "await page.locator('//button').click()\nawait page.locator('text=a >> text=b').click()\n"
    const path = writeSpec('a.spec.ts', original)
    await runFix(['--write'])
    expect(readFileSync(path, 'utf8')).toBe(original)
  })
})

describe('fix — output modes', () => {
  it('emits a stable JSON report', async () => {
    writeSpec('a.spec.ts', "await page.locator('text=Submit').click()\n")
    const { stdout } = await runFix([], ['--json'])
    const report = JSON.parse(stdout)
    expect(report).toMatchObject({ command: 'fix', dryRun: true })
    expect(report.summary).toMatchObject({ files: 1, fixes: 1 })
    expect(report.files[0].fixes[0].kind).toBe('text-engine-to-get-by-text')
  })

  it('prints nothing with --quiet', async () => {
    writeSpec('a.spec.ts', "await page.locator('text=Submit').click()\n")
    const { stdout } = await runFix([], ['--quiet'])
    expect(stdout).toBe('')
  })
})
