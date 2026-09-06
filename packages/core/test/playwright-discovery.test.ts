import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  type LoadConfigResult,
  loadConfig,
  readPlaywrightTestSettings,
  resolveDiscovery,
} from '../src/index.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'testpilot-pw-'))
  writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function writeFile(relativePath: string, body: string): string {
  const full = join(dir, relativePath)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, body)
  return full
}

const readSettings = (path: string) => readPlaywrightTestSettings(path)

async function resolveIn(cwd: string, options: { disable?: boolean } = {}) {
  const loaded: LoadConfigResult = await loadConfig({ cwd })
  const rootDir = loaded.filepath ? join(loaded.filepath, '..') : cwd
  return resolveDiscovery(loaded, {
    rootDir,
    disablePlaywrightFallback: options.disable,
  })
}

describe('readPlaywrightTestSettings — static parsing', () => {
  it('reads testDir (resolved against the config file) and a string testMatch', () => {
    const path = writeFile(
      'playwright.config.ts',
      "export default { testDir: './e2e', testMatch: '**/*.e2e.ts' }\n",
    )
    const read = readSettings(path)
    expect(read).toEqual({
      status: 'ok',
      unresolved: [],
      settings: {
        testDirs: [join(dir, 'e2e')],
        testMatch: [{ kind: 'glob', value: '**/*.e2e.ts' }],
        testIgnore: [],
      },
    })
  })

  it('preserves a RegExp testMatch instead of dropping or mistranslating it', () => {
    // immich's real shape.
    const path = writeFile(
      'playwright.config.ts',
      "export default { testDir: './src/specs/server', testMatch: /.*\\.e2e-spec\\.ts/ }\n",
    )
    const read = readSettings(path)
    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.settings.testMatch).toEqual([
      { kind: 'regex', source: '.*\\.e2e-spec\\.ts', flags: '' },
    ])
  })

  it('unions projects[] test roots and matchers with the top level', () => {
    // cal.com's real shape: nothing at the top level, everything in projects[].
    const path = writeFile(
      'playwright.config.ts',
      `import { defineConfig } from '@playwright/test'
export default defineConfig({
  projects: [
    { name: 'web', testDir: './apps/web/playwright', testMatch: /.*\\.e2e\\.tsx?/ },
    { name: 'api', testDir: './apps/api/playwright', testMatch: /.*\\.e2e\\.tsx?/ },
  ],
})
`,
    )
    const read = readSettings(path)
    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.settings.testDirs).toEqual([
      join(dir, 'apps/web/playwright'),
      join(dir, 'apps/api/playwright'),
    ])
    expect(read.settings.testMatch).toHaveLength(2)
  })

  it('unwraps defineConfig() and `export default config`', () => {
    const viaCall = writeFile(
      'a/playwright.config.ts',
      "import { defineConfig } from '@playwright/test'\nexport default defineConfig({ testDir: 'e2e' })\n",
    )
    const viaVariable = writeFile(
      'b/playwright.config.ts',
      "const config = { testDir: 'e2e' }\nexport default config\n",
    )
    for (const path of [viaCall, viaVariable]) {
      const read = readSettings(path)
      expect(read.status, path).toBe('ok')
      if (read.status !== 'ok') continue
      expect(read.settings.testDirs).toHaveLength(1)
    }
  })

  it('never executes the config — side effects do not happen and do not stop the read', () => {
    // The whole point of parsing rather than importing: `analyze` is routinely
    // pointed at a repo the user is only evaluating.
    const sentinel = join(dir, 'SIDE-EFFECT')
    const path = writeFile(
      'playwright.config.ts',
      `import { writeFileSync } from 'node:fs'
writeFileSync(${JSON.stringify(sentinel)}, 'x')
process.stdout.write('noise that would corrupt --json')
if (!process.env.BASE_URL) process.exit(1)
export default { testDir: 'e2e', testMatch: '**/*.e2e.ts' }
`,
    )
    const read = readSettings(path)
    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.settings.testDirs).toEqual([join(dir, 'e2e')])
    expect(() => rmSync(sentinel)).toThrow() // the side effect never ran
  })

  it('reports a computed value as unresolved rather than guessing', () => {
    const path = writeFile(
      'playwright.config.ts',
      "export default { testDir: process.env.DIR ?? 'e2e' }\n",
    )
    expect(readSettings(path)).toEqual({
      status: 'unreadable',
      reason: 'testDir is computed, not a literal',
    })
  })

  it('separates "declares nothing" from "cannot be read"', () => {
    const bare = writeFile('bare/playwright.config.ts', "export default { reporter: 'list' }\n")
    expect(readSettings(bare)).toEqual({ status: 'no-settings' })
  })

  it('reports unparseable and absent files without throwing', () => {
    const broken = writeFile('playwright.config.ts', 'export default { testDir: \n')
    expect(readSettings(broken).status).toBe('unreadable')
    expect(readSettings(join(dir, 'nope.config.ts'))).toEqual({
      status: 'unreadable',
      reason: 'file could not be read',
    })
  })
})

describe('resolveDiscovery', () => {
  it('adopts a Playwright suite when there is no testpilot.config.ts', async () => {
    writeFile('playwright.config.ts', "export default { testDir: 'e2e', testMatch: '*.e2e.ts' }\n")
    const resolved = await resolveIn(dir)
    expect(resolved.roots).toEqual([join(dir, 'e2e')])
    // A bare pattern must match at any depth, as Playwright matches it.
    expect(resolved.config.include).toEqual(['**/*.e2e.ts'])
    expect(resolved.discovery.testDir).toBe('playwright-config')
    expect(resolved.discovery.include).toBe('playwright-config')
    expect(resolved.discovery.playwrightConfigPath).toBe(join(dir, 'playwright.config.ts'))
  })

  it('does NOT take testMatch while keeping its own testDir (the pair is atomic)', async () => {
    // The `testpilot init` shape: testDir set, include not. Taking Playwright's
    // testMatch here silently emptied the analyzed file set.
    writeFile(
      'playwright.config.ts',
      "export default { testDir: 'e2e', testMatch: '**/*.e2e.ts' }\n",
    )
    writeFile('testpilot.config.ts', "export default { testDir: 'tests' }\n")
    const resolved = await resolveIn(dir)
    expect(resolved.config.testDir).toBe('tests')
    expect(resolved.config.include).toEqual([
      '**/*.{spec,test,e2e,e2e-spec}.{ts,tsx,js,jsx,mjs,cjs}',
    ])
    expect(resolved.discovery.include).toBe('default')
    expect(resolved.roots).toEqual([])
  })

  it('is skipped entirely when the user opts out', async () => {
    writeFile('playwright.config.ts', "export default { testDir: 'e2e' }\n")
    const resolved = await resolveIn(dir, { disable: true })
    expect(resolved.discovery.playwrightConfigPath).toBeNull()
    expect(resolved.roots).toEqual([])
  })

  it('appends testIgnore globs to exclude and keeps RegExp ignores separate', async () => {
    writeFile(
      'playwright.config.ts',
      "export default { testDir: 'e2e', testIgnore: ['legacy/**', /fixtures/] }\n",
    )
    const resolved = await resolveIn(dir)
    expect(resolved.config.exclude).toContain('**/node_modules/**')
    expect(resolved.config.exclude).toContain('**/legacy/**')
    expect(resolved.ignoreRegex).toEqual(['fixtures'])
    expect(resolved.discovery.exclude).toBe('playwright-config')
  })

  it('finds a Playwright config one level down (immich keeps it in e2e/)', async () => {
    writeFile('e2e/playwright.config.ts', "export default { testDir: './src/specs' }\n")
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.playwrightConfigPath).toBe(join(dir, 'e2e/playwright.config.ts'))
    expect(resolved.roots).toEqual([resolve(dir, 'e2e/src/specs')])
  })

  it('refuses to guess when several sub-directories have a Playwright config', async () => {
    writeFile('e2e/playwright.config.ts', "export default { testDir: 'a' }\n")
    writeFile('integration/playwright.config.ts', "export default { testDir: 'b' }\n")
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.playwrightConfigPath).toBeNull()
    expect(resolved.discovery.testDir).toBe('default')
  })

  it('records why a Playwright config was found but not used', async () => {
    writeFile('playwright.config.ts', "export default { testDir: process.env.DIR ?? 'e2e' }\n")
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.playwrightConfigPath).toBeNull()
    expect(resolved.discovery.playwrightConfigIgnored).toEqual({
      path: join(dir, 'playwright.config.ts'),
      reason: 'testDir is computed, not a literal',
    })
  })

  it('treats an explicitly-undefined key as unset, so the fallback still applies', async () => {
    writeFile('playwright.config.ts', "export default { testDir: 'e2e' }\n")
    writeFile('testpilot.config.ts', 'export default { testDir: undefined }\n')
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.testDir).toBe('playwright-config')
    expect(resolved.roots).toEqual([join(dir, 'e2e')])
  })

  it('reports built-in defaults when there is no Playwright config at all', async () => {
    const resolved = await resolveIn(dir)
    expect(resolved.config.testDir).toBe('tests')
    expect(resolved.discovery).toEqual({
      testDir: 'default',
      include: 'default',
      exclude: 'default',
      playwrightConfigPath: null,
      playwrightConfigIgnored: null,
    })
  })
})
