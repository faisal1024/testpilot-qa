import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildPlaywrightArgs,
  findPlaywrightConfig,
  findProjectRoot,
  resolvePlaywrightBin,
  runPlaywright,
} from '../src/index.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'testpilot-proj-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('findProjectRoot', () => {
  it('returns the nearest ancestor with a package.json', () => {
    writeFileSync(join(dir, 'package.json'), '{}')
    const nested = join(dir, 'tests', 'ui')
    mkdirSync(nested, { recursive: true })
    expect(findProjectRoot(nested)).toBe(dir)
  })

  it('falls back to the cwd when no package.json exists', () => {
    expect(findProjectRoot(dir)).toBe(dir)
  })
})

describe('findPlaywrightConfig', () => {
  it('prefers an existing hinted path', () => {
    const file = join(dir, 'pw.config.ts')
    writeFileSync(file, '')
    expect(findPlaywrightConfig(dir, 'pw.config.ts')).toBe(file)
  })

  it('discovers a standard config when no hint matches', () => {
    const file = join(dir, 'playwright.config.ts')
    writeFileSync(file, '')
    expect(findPlaywrightConfig(dir, 'missing.ts')).toBe(file)
  })

  it('returns null when nothing is found', () => {
    expect(findPlaywrightConfig(dir)).toBeNull()
  })
})

describe('resolvePlaywrightBin', () => {
  it('returns null when Playwright is not installed', () => {
    expect(resolvePlaywrightBin(dir)).toBeNull()
  })

  it('finds the local Playwright binary', () => {
    const binDir = join(dir, 'node_modules', '.bin')
    mkdirSync(binDir, { recursive: true })
    const binName = process.platform === 'win32' ? 'playwright.cmd' : 'playwright'
    writeFileSync(join(binDir, binName), '')
    expect(resolvePlaywrightBin(dir)).toBe(join(binDir, binName))
  })
})

describe('buildPlaywrightArgs', () => {
  it('always runs `test` and forwards extra args', () => {
    expect(
      buildPlaywrightArgs({
        projectRoot: dir,
        binPath: '/bin/playwright',
        playwrightConfigPath: null,
        forwardedArgs: ['--project=chromium'],
      }),
    ).toEqual(['test', '--project=chromium'])
  })

  it('passes --config when a config path is known', () => {
    expect(
      buildPlaywrightArgs({
        projectRoot: dir,
        binPath: '/bin/playwright',
        playwrightConfigPath: '/p/playwright.config.ts',
        forwardedArgs: [],
      }),
    ).toEqual(['test', '--config', '/p/playwright.config.ts'])
  })

  it('forwards Playwright parallelism args verbatim', () => {
    expect(
      buildPlaywrightArgs({
        projectRoot: dir,
        binPath: '/bin/playwright',
        playwrightConfigPath: null,
        forwardedArgs: ['--workers=2'],
      }),
    ).toEqual(['test', '--workers=2'])

    expect(
      buildPlaywrightArgs({
        projectRoot: dir,
        binPath: '/bin/playwright',
        playwrightConfigPath: null,
        forwardedArgs: ['tests/ui', '--workers=2'],
      }),
    ).toEqual(['test', 'tests/ui', '--workers=2'])
  })
})

describe('runPlaywright', () => {
  it('invokes the runner with the binary and built args, returning its exit code', async () => {
    const calls: Array<{ command: string; args: string[]; cwd: string }> = []
    const code = await runPlaywright(
      {
        projectRoot: dir,
        binPath: '/bin/playwright',
        playwrightConfigPath: null,
        forwardedArgs: ['tests/example.spec.ts'],
      },
      async (command, args, options) => {
        calls.push({ command, args, cwd: options.cwd })
        return 7
      },
    )
    expect(code).toBe(7)
    expect(calls).toEqual([
      { command: '/bin/playwright', args: ['test', 'tests/example.spec.ts'], cwd: dir },
    ])
  })

  it.skipIf(process.platform === 'win32')(
    'forwards --workers=2 to the real binary and preserves its exit code',
    async () => {
      const argvFile = join(dir, 'argv.txt')
      const bin = join(dir, 'fake-playwright')
      writeFileSync(bin, `#!/usr/bin/env bash\necho "$@" > "${argvFile}"\nexit 3\n`)
      chmodSync(bin, 0o755)

      const code = await runPlaywright({
        projectRoot: dir,
        binPath: bin,
        playwrightConfigPath: null,
        forwardedArgs: ['tests/ui', '--workers=2'],
      })

      expect(code).toBe(3)
      expect(readFileSync(argvFile, 'utf8').trim()).toBe('test tests/ui --workers=2')
    },
  )
})
