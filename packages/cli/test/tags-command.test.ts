import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildProgram } from '../src/program.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'testpilot-tags-cmd-'))
  mkdirSync(join(dir, 'tests'), { recursive: true })
  writeFileSync(
    join(dir, 'tests', 'a.spec.ts'),
    [
      "test.describe('billing @regression', () => {",
      "  test('one @smoke', async () => {})",
      "  test('two', async () => {})",
      '})',
      "test('three', async () => {})",
    ].join('\n'),
  )
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

async function runTags(extraArgs: string[] = []) {
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
    await buildProgram().parseAsync(['node', 'testpilot', 'tags', '--cwd', dir, ...extraArgs])
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

describe('tags command', () => {
  it('lists the vocabulary with counts on stdout', async () => {
    const { stdout, stderr } = await runTags()
    expect(stdout).toContain('@regression')
    expect(stdout).toContain('@smoke')
    expect(stdout).toContain('2 tag(s) across 3 test declarations in 1 file(s); 1 untagged.')
    expect(stderr).toBe('')
  })

  it('emits JSON with --json', async () => {
    const { stdout } = await runTags(['--json'])
    const report = JSON.parse(stdout)
    expect(report.command).toBe('tags')
    expect(report.tags).toEqual([
      { tag: 'regression', tests: 2, files: 1, sources: ['title'], selectable: true },
      { tag: 'smoke', tests: 1, files: 1, sources: ['title'], selectable: true },
    ])
    expect(report.summary.untaggedTests).toBe(1)
  })

  it('prints nothing with --quiet', async () => {
    const { stdout } = await runTags(['--quiet'])
    expect(stdout).toBe('')
  })

  it('writes a report file with --output', async () => {
    const { stdout } = await runTags(['--output', 'tags.json'])
    expect(stdout).toContain('Tag report written to')
    expect(JSON.parse(readFileSync(join(dir, 'tags.json'), 'utf8')).command).toBe('tags')
  })

  it('teaches the syntax when a suite has no tags at all', async () => {
    rmSync(join(dir, 'tests', 'a.spec.ts'))
    writeFileSync(join(dir, 'tests', 'a.spec.ts'), "test('plain', async () => {})")
    const { stdout } = await runTags()
    expect(stdout).toContain('No tags found in 1 test declaration')
    expect(stdout).toContain('testpilot run --tag smoke')
  })

  it('fails like analyze when discovery matched nothing, rather than reporting no tags', async () => {
    rmSync(join(dir, 'tests'), { recursive: true })
    const { exitCode, stderr } = await runTags()
    expect(exitCode).toBe(3)
    expect(stderr).toContain('No test files matched')
  })

  it('lists configured suites and flags a tag no test carries', async () => {
    writeFileSync(
      join(dir, 'testpilot.config.ts'),
      "export default { suites: { nightly: ['regression'], typo: ['regresion'] } }\n",
    )
    const { stdout } = await runTags()
    expect(stdout).toContain('nightly: any of @regression — 2 test declaration(s)')
    expect(stdout).toContain('no test carries @regresion')
  })

  it('accepts explicit patterns', async () => {
    const { stdout } = await runTags(['tests/a.spec.ts'])
    expect(stdout).toContain('@smoke')
  })
})
