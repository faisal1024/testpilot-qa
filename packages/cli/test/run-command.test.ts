import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildProgram } from '../src/program.js'

let dir: string
const argsFile = () => join(dir, 'args.txt')

// The runner spawns a real binary, so the fake records exactly what Playwright
// would have received — the compiled flags, not our intent about them.
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'testpilot-run-cmd-'))
  writeFileSync(join(dir, 'package.json'), '{"name":"fixture"}')
  mkdirSync(join(dir, 'node_modules', '.bin'), { recursive: true })
  const bin = join(dir, 'node_modules', '.bin', 'playwright')
  writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' "$@" > "${argsFile()}"\nexit 0\n`)
  chmodSync(bin, 0o755)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

async function runRun(extraArgs: string[] = []) {
  const errs: string[] = []
  let exitCode: number | undefined
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errs.push(args.map(String).join(' '))
  })
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCode = code
    throw new Error('__exit__')
  }) as never)
  try {
    await buildProgram().parseAsync(['node', 'testpilot', 'run', '--cwd', dir, ...extraArgs])
  } catch (error) {
    if (!(error instanceof Error) || error.message !== '__exit__') {
      throw error
    }
  } finally {
    logSpy.mockRestore()
    errSpy.mockRestore()
    exitSpy.mockRestore()
  }
  let forwarded: string[] = []
  try {
    forwarded = readFileSync(argsFile(), 'utf8').split('\n').filter(Boolean)
  } catch {
    forwarded = []
  }
  return { stderr: errs.join('\n'), exitCode, forwarded }
}

function writeConfig(body: string): void {
  writeFileSync(join(dir, 'testpilot.config.ts'), body)
}

describe.skipIf(process.platform === 'win32')('run --tag', () => {
  it('stays a pure pass-through with no tag flags', async () => {
    const { forwarded } = await runRun()
    expect(forwarded).toEqual(['test'])
  })

  it('compiles --tag to a --grep Playwright accepts', async () => {
    const { forwarded } = await runRun(['--tag', 'smoke'])
    expect(forwarded[1]).toBe('--grep')
    const pattern = forceRegExp(forwarded[2] as string)
    expect(pattern.test('checkout @smoke')).toBe(true)
    expect(pattern.test('checkout @smoketest')).toBe(false)
    // Playwright compiles a BARE --grep string with `gi`; ours must be exact.
    expect(pattern.test('checkout @SMOKE')).toBe(false)
  })

  it('compiles an exclusion to --grep-invert', async () => {
    const { forwarded } = await runRun(['--tag', 'smoke', '--exclude-tag', 'slow'])
    expect(forwarded).toContain('--grep')
    expect(forwarded).toContain('--grep-invert')
  })

  it('accepts !tag as an exclusion', async () => {
    const { forwarded } = await runRun(['--tag', '!slow'])
    expect(forwarded).toContain('--grep-invert')
    expect(forwarded).not.toContain('--grep')
  })

  it('prints the compiled flags so the project stays ejectable', async () => {
    const { stderr } = await runRun(['--tag', 'smoke'])
    expect(stderr).toContain('Tags: any of @smoke')
    expect(stderr).toContain('Compiled to: --grep')
  })

  it('still forwards args after --', async () => {
    const { forwarded } = await runRun(['--tag', 'smoke', '--', '--headed'])
    expect(forwarded).toContain('--headed')
    expect(forwarded).toContain('--grep')
  })

  it('refuses to combine --tag with a forwarded --grep', async () => {
    // Playwright keeps the last occurrence, so one of the two filters would be
    // silently dropped.
    const { exitCode, stderr } = await runRun(['--tag', 'smoke', '--', '--grep', 'x'])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('Cannot combine')
  })

  it('allows a forwarded --grep when no tag flags are used', async () => {
    const { forwarded, exitCode } = await runRun(['--', '--grep', 'x'])
    expect(exitCode).toBe(0)
    expect(forwarded).toEqual(['test', '--grep', 'x'])
  })

  it('exits 2 on a malformed tag', async () => {
    const { exitCode, stderr } = await runRun(['--tag', 'has space'])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('not a valid tag name')
  })

  it.each([[''], [','], [' ']])('exits 2 on an empty tag value %j', async (value) => {
    const { exitCode, stderr, forwarded } = await runRun(['--tag', value])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('would run every test')
    expect(forwarded).toEqual([])
  })

  it('refuses a forwarded -G, the real --grep-invert alias', async () => {
    const { exitCode, stderr } = await runRun(['--exclude-tag', 'slow', '--', '-G', '@flaky'])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('Cannot combine')
  })

  it('refuses a forwarded short flag with an attached value', async () => {
    const { exitCode } = await runRun(['--tag', 'smoke', '--', '-g@slow'])
    expect(exitCode).toBe(2)
  })

  it('exits 2 on a self-cancelling selection', async () => {
    const { exitCode } = await runRun(['--tag', 'smoke', '--exclude-tag', 'smoke'])
    expect(exitCode).toBe(2)
  })
})

describe.skipIf(process.platform === 'win32')('run --suite', () => {
  it('expands a configured suite', async () => {
    writeConfig("export default { suites: { nightly: ['regression', '!flaky'] } }\n")
    const { forwarded } = await runRun(['--suite', 'nightly'])
    expect(forceRegExp(forwarded[2] as string).test('x @regression')).toBe(true)
    expect(forceRegExp(forwarded[4] as string).test('x @flaky')).toBe(true)
  })

  it('exits 2 on an unknown suite and names the real ones', async () => {
    writeConfig("export default { suites: { nightly: ['regression'] } }\n")
    const { exitCode, stderr } = await runRun(['--suite', 'nighlty'])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('Available suites: nightly')
    // A typo must not fall through to running the whole suite.
    expect(readFileSyncSafe(argsFile())).toBeNull()
  })

  it('refuses two suites rather than folding them into one wrong selection', async () => {
    // fast means "everything except @slow"; nightly means "@regression".
    // Merged they would become "regression, excluding slow" — neither suite.
    writeConfig("export default { suites: { fast: ['!slow'], nightly: ['regression'] } }\n")
    const { exitCode, stderr, forwarded } = await runRun(['--suite', 'fast', '--suite', 'nightly'])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('Only one --suite')
    expect(forwarded).toEqual([])
  })

  it('exits 2 on an empty --suite value', async () => {
    writeConfig("export default { suites: { nightly: ['regression'] } }\n")
    const { exitCode, forwarded } = await runRun(['--suite', ''])
    expect(exitCode).toBe(2)
    expect(forwarded).toEqual([])
  })

  it('expands an all-of suite into lookaheads', async () => {
    writeConfig("export default { suites: { hardened: { all: ['regression', 'critical'] } } }\n")
    const { forwarded } = await runRun(['--suite', 'hardened'])
    const grep = forceRegExp(forwarded[2] as string)
    expect(grep.test('x @regression @critical')).toBe(true)
    expect(grep.test('x @regression')).toBe(false)
  })

  it('refuses --suite together with --tag rather than guessing the semantics', async () => {
    // "the nightly suite plus the smoke tests" and "the nightly suite narrowed
    // to smoke" are equally natural readings; an all-of suite silently gave the
    // second while the docs promised the first.
    writeConfig("export default { suites: { nightly: ['regression'] } }\n")
    const { exitCode, stderr, forwarded } = await runRun(['--suite', 'nightly', '--tag', 'smoke'])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('Cannot combine --suite with --tag')
    expect(forwarded).toEqual([])
  })

  it('refuses a combined short-flag cluster carrying a grep', async () => {
    // commander parses `-xg '@foo'` as `-x -g @foo`.
    const { exitCode } = await runRun(['--tag', 'smoke', '--', '-xg', '@foo'])
    expect(exitCode).toBe(2)
  })

  it('composes a suite with an extra --exclude-tag', async () => {
    writeConfig("export default { suites: { nightly: ['regression'] } }\n")
    const { forwarded } = await runRun(['--suite', 'nightly', '--exclude-tag', 'slow'])
    expect(forwarded).toContain('--grep-invert')
  })
})

function readFileSyncSafe(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/**
 * Playwright's own `forceRegExp` (packages/playwright/src/util.ts), copied so
 * these tests assert what Playwright will actually do with our `--grep` value.
 * A bare `new RegExp(src)` claims a case-sensitivity Playwright does not give a
 * plain string, which is exactly how the `gi` defect went unnoticed.
 */
function forceRegExp(pattern: string): RegExp {
  const match = pattern.match(/^\/(.*)\/([gi]*)$/)
  if (match) {
    return new RegExp(match[1] as string, match[2])
  }
  return new RegExp(pattern, 'gi')
}
