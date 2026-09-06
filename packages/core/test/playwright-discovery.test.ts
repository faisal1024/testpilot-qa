import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig, readPlaywrightTestSettings } from '../src/index.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'testpilot-pw-'))
  writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function writePlaywrightConfig(body: string): void {
  writeFileSync(join(dir, 'playwright.config.ts'), body)
}

describe('readPlaywrightTestSettings', () => {
  it('reads testDir and normalizes a string testMatch to a glob list', async () => {
    writePlaywrightConfig("export default { testDir: 'e2e', testMatch: '**/*.e2e.ts' }\n")
    expect(await readPlaywrightTestSettings(join(dir, 'playwright.config.ts'))).toEqual({
      testDir: 'e2e',
      testMatch: ['**/*.e2e.ts'],
    })
  })

  it('reads an array testMatch and testIgnore', async () => {
    writePlaywrightConfig(
      "export default { testMatch: ['**/*.e2e.ts', '**/*.spec.ts'], testIgnore: ['**/legacy/**'] }\n",
    )
    expect(await readPlaywrightTestSettings(join(dir, 'playwright.config.ts'))).toEqual({
      testMatch: ['**/*.e2e.ts', '**/*.spec.ts'],
      testIgnore: ['**/legacy/**'],
    })
  })

  it('ignores values that cannot be expressed as globs (RegExp testMatch)', async () => {
    writePlaywrightConfig("export default { testDir: 'e2e', testMatch: /.*\\.e2e\\.ts/ }\n")
    // testDir is still usable; the RegExp is dropped rather than mistranslated.
    expect(await readPlaywrightTestSettings(join(dir, 'playwright.config.ts'))).toEqual({
      testDir: 'e2e',
    })
  })

  it('returns null for a config that cannot be loaded, rather than throwing', async () => {
    // The real-world case: the config imports @playwright/test, which is not installed here.
    writePlaywrightConfig(
      "import { defineConfig } from '@playwright/test'\nexport default defineConfig({ testDir: 'e2e' })\n",
    )
    expect(await readPlaywrightTestSettings(join(dir, 'playwright.config.ts'))).toBeNull()
    expect(await readPlaywrightTestSettings(join(dir, 'nope.config.ts'))).toBeNull()
  })

  it('returns null when the config carries none of the discovery keys', async () => {
    writePlaywrightConfig('export default { reporter: "list" }\n')
    expect(await readPlaywrightTestSettings(join(dir, 'playwright.config.ts'))).toBeNull()
  })
})

describe('loadConfig — Playwright fallback', () => {
  it('adopts testDir and testMatch when there is no testpilot.config.ts', async () => {
    // The cal.com / immich shape: a suite the built-in default glob would never match.
    writePlaywrightConfig("export default { testDir: 'e2e', testMatch: '**/*.e2e.ts' }\n")
    const result = await loadConfig({ cwd: dir })
    expect(result.filepath).toBeNull()
    expect(result.config.testDir).toBe('e2e')
    expect(result.config.include).toEqual(['**/*.e2e.ts'])
    expect(result.discovery).toEqual({
      testDir: 'playwright-config',
      include: 'playwright-config',
      playwrightConfigPath: join(dir, 'playwright.config.ts'),
    })
  })

  it('lets an explicit TestPilot setting win, per key', async () => {
    writePlaywrightConfig("export default { testDir: 'e2e', testMatch: '**/*.e2e.ts' }\n")
    writeFileSync(join(dir, 'testpilot.config.ts'), "export default { testDir: 'tests' }\n")
    const result = await loadConfig({ cwd: dir })
    expect(result.config.testDir).toBe('tests')
    expect(result.config.include).toEqual(['**/*.e2e.ts'])
    expect(result.discovery.testDir).toBe('testpilot-config')
    expect(result.discovery.include).toBe('playwright-config')
  })

  it('appends testIgnore to exclude instead of replacing the defaults', async () => {
    writePlaywrightConfig("export default { testIgnore: ['**/legacy/**'], testDir: 'e2e' }\n")
    const result = await loadConfig({ cwd: dir })
    expect(result.config.exclude).toContain('**/node_modules/**')
    expect(result.config.exclude).toContain('**/legacy/**')
  })

  it('reports built-in defaults when there is no Playwright config either', async () => {
    const result = await loadConfig({ cwd: dir })
    expect(result.config.testDir).toBe('tests')
    expect(result.discovery).toEqual({
      testDir: 'default',
      include: 'default',
      playwrightConfigPath: null,
    })
  })

  it('finds the Playwright config next to the testpilot config, not the cwd', async () => {
    mkdirSync(join(dir, 'packages', 'web', 'src'), { recursive: true })
    writeFileSync(join(dir, 'packages', 'web', 'testpilot.config.ts'), 'export default {}\n')
    writeFileSync(
      join(dir, 'packages', 'web', 'playwright.config.ts'),
      "export default { testDir: 'e2e' }\n",
    )
    const result = await loadConfig({ cwd: join(dir, 'packages', 'web', 'src') })
    expect(result.config.testDir).toBe('e2e')
    expect(result.discovery.playwrightConfigPath).toBe(
      join(dir, 'packages', 'web', 'playwright.config.ts'),
    )
  })
})
