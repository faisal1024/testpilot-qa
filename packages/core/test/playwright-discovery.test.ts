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
        scopes: [
          {
            root: join(dir, 'e2e'),
            match: [{ kind: 'glob', value: '**/*.e2e.ts' }],
            ignore: [],
          },
        ],
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
    expect(read.settings.scopes[0]?.match).toEqual([
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
    expect(read.settings.scopes.map((scope) => scope.root)).toEqual([
      join(dir, 'apps/web/playwright'),
      join(dir, 'apps/api/playwright'),
    ])
    expect(read.settings.scopes[0]?.match).toHaveLength(1)
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
      expect(read.settings.scopes).toHaveLength(1)
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
    expect(read.settings.scopes[0]?.root).toBe(join(dir, 'e2e'))
    expect(() => rmSync(sentinel)).toThrow() // the side effect never ran
  })

  it('reports a computed value as unresolved rather than guessing', () => {
    const path = writeFile(
      'playwright.config.ts',
      "export default { testDir: process.env.DIR ?? 'e2e' }\n",
    )
    expect(readSettings(path)).toEqual({
      status: 'unreadable',
      reason: 'testDir is not a literal value',
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

it('reports a spread as unresolved instead of reading the config as empty', () => {
  // The standard shared-base monorepo shape: keys we cannot see must not look absent.
  const path = writeFile(
    'playwright.config.ts',
    "import base from './base'\nexport default { ...base, reporter: 'list' }\n",
  )
  expect(readSettings(path)).toEqual({
    status: 'unreadable',
    reason: 'a spread from another object is not a literal value',
  })
})

it('reads a CommonJS module.exports config', () => {
  const path = writeFile(
    'playwright.config.cjs',
    "const { defineConfig } = require('@playwright/test')\nmodule.exports = defineConfig({ testDir: 'e2e' })\n",
  )
  const read = readSettings(path)
  expect(read.status).toBe('ok')
  if (read.status !== 'ok') return
  expect(read.settings.scopes[0]?.root).toBe(join(dir, 'e2e'))
})

it('defaults a scope root to the config directory, as Playwright does', () => {
  const path = writeFile(
    'e2e/playwright.config.ts',
    "export default { testMatch: '**/*.e2e.ts' }\n",
  )
  const read = readSettings(path)
  expect(read.status).toBe('ok')
  if (read.status !== 'ok') return
  expect(read.settings.scopes[0]?.root).toBe(join(dir, 'e2e'))
})

it('gives each project its own selectors, inheriting the top level', () => {
  const path = writeFile(
    'playwright.config.ts',
    `export default {
  testMatch: '**/*.spec.ts',
  projects: [
    { name: 'web', testDir: './web' },
    { name: 'embeds', testDir: './embeds', testIgnore: '**/legacy/**' },
  ],
}
`,
  )
  const read = readSettings(path)
  expect(read.status).toBe('ok')
  if (read.status !== 'ok') return
  const [web, embeds] = read.settings.scopes
  expect(web?.match).toEqual([{ kind: 'glob', value: '**/*.spec.ts' }]) // inherited
  expect(web?.ignore).toEqual([]) // NOT the sibling project's ignore
  expect(embeds?.ignore).toEqual([{ kind: 'glob', value: '**/legacy/**' }])
})

describe('resolveDiscovery', () => {
  it('adopts a Playwright suite when there is no testpilot.config.ts', async () => {
    writeFile('playwright.config.ts', "export default { testDir: 'e2e', testMatch: '*.e2e.ts' }\n")
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.roots).toEqual([join(dir, 'e2e')])
    // A bare pattern must match at any depth, as Playwright matches it.
    expect(resolved.scopes[0]?.includeGlobs).toEqual(['**/*.e2e.ts'])
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
    expect(resolved.discovery.roots).toEqual([join(dir, 'tests')])
    // An explicit testDir makes adoption impossible, so nothing is reported as ignored.
    expect(resolved.discovery.playwrightConfigIgnored).toBeNull()
  })

  it('is skipped entirely when the user opts out', async () => {
    writeFile('playwright.config.ts', "export default { testDir: 'e2e' }\n")
    const resolved = await resolveIn(dir, { disable: true })
    expect(resolved.discovery.playwrightConfigPath).toBeNull()
    expect(resolved.discovery.testDir).toBe('default')
  })

  it('appends testIgnore globs to exclude and keeps RegExp ignores separate', async () => {
    writeFile(
      'playwright.config.ts',
      "export default { testDir: 'e2e', testIgnore: ['legacy/**', /fixtures/] }\n",
    )
    const resolved = await resolveIn(dir)
    expect(resolved.scopes[0]?.excludeGlobs).toContain('**/legacy/**')
    expect(resolved.scopes[0]?.ignoreRegex).toEqual(['fixtures'])
    expect(resolved.discovery.exclude).toBe('playwright-config')
  })

  it('finds a Playwright config one level down (immich keeps it in e2e/)', async () => {
    writeFile('e2e/playwright.config.ts', "export default { testDir: './src/specs' }\n")
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.playwrightConfigPath).toBe(join(dir, 'e2e/playwright.config.ts'))
    expect(resolved.discovery.roots).toEqual([resolve(dir, 'e2e/src/specs')])
  })

  it('refuses to guess when several sub-directories have a Playwright config', async () => {
    writeFile('e2e/playwright.config.ts', "export default { testDir: 'a' }\n")
    writeFile('integration/playwright.config.ts', "export default { testDir: 'b' }\n")
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.playwrightConfigPath).toBeNull()
    expect(resolved.discovery.testDir).toBe('default')
    // Refusing to guess is fine; refusing silently is not.
    expect(resolved.discovery.playwrightConfigIgnored?.reason).toContain('several sub-directories')
  })

  it('records why a Playwright config was found but not used', async () => {
    writeFile('playwright.config.ts', "export default { testDir: process.env.DIR ?? 'e2e' }\n")
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.playwrightConfigPath).toBeNull()
    expect(resolved.discovery.playwrightConfigIgnored).toEqual({
      path: join(dir, 'playwright.config.ts'),
      reason: 'testDir is not a literal value',
    })
  })

  it('treats an explicitly-undefined key as unset, so the fallback still applies', async () => {
    writeFile('playwright.config.ts', "export default { testDir: 'e2e' }\n")
    writeFile('testpilot.config.ts', 'export default { testDir: undefined }\n')
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.testDir).toBe('playwright-config')
    expect(resolved.discovery.roots).toEqual([join(dir, 'e2e')])
  })

  it('reports built-in defaults when there is no Playwright config at all', async () => {
    const resolved = await resolveIn(dir)
    expect(resolved.config.testDir).toBe('tests')
    expect(resolved.discovery).toEqual({
      testDir: 'default',
      include: 'default',
      exclude: 'default',
      roots: [join(dir, 'tests')],
      playwrightConfigPath: null,
      playwrightConfigIgnored: null,
    })
  })

  it("keeps the user's exclude provenance when it only appends a Playwright ignore", async () => {
    writeFile(
      'playwright.config.ts',
      "export default { testDir: 'e2e', testIgnore: '**/theirs/**' }\n",
    )
    writeFile('testpilot.config.ts', "export default { exclude: ['**/mine/**'] }\n")
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.exclude).toBe('testpilot-config')
    expect(resolved.scopes[0]?.excludeGlobs).toEqual(
      expect.arrayContaining(['**/mine/**', '**/theirs/**']),
    )
  })

  it('marks exclude as Playwright-sourced when only a RegExp testIgnore filtered', async () => {
    writeFile('playwright.config.ts', "export default { testDir: 'e2e', testIgnore: /slow/ }\n")
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.exclude).toBe('playwright-config')
  })
})
