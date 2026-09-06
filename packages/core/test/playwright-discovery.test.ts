import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_HELPER_PATTERNS,
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
      declaresTags: false,
      testIdAttribute: null,
      sawConfigObject: true,
      settings: {
        scopes: [
          {
            root: join(dir, 'e2e'),
            match: [{ kind: 'glob', value: '**/*.e2e.ts' }],
            ignore: [],
          },
        ],
        declaresTags: false,
        testIdAttribute: null,
      },
    })
  })

  it('reports a config-level `tag` key, which Playwright applies to every test', () => {
    // We do not read the values yet; knowing the key exists is what stops the
    // tag vocabulary from claiming to be complete.
    const path = writeFile(
      'playwright.config.ts',
      "export default { testDir: './e2e', tag: '@APIv2' }\n",
    )
    const read = readSettings(path)
    expect(read.status).toBe('ok')
    expect(read.status === 'ok' && read.settings.declaresTags).toBe(true)
  })

  it('does not report a project-level `tag`, which Playwright has no such key for', () => {
    // `tag` is on TestConfig only (types/test.d.ts). Reporting one from a
    // project entry would claim a config-wide tag that does not exist.
    const path = writeFile(
      'playwright.config.ts',
      "export default { projects: [{ testDir: './e2e', tag: ['@a'] }] }\n",
    )
    const read = readSettings(path)
    expect(read.status === 'ok' && read.settings.declaresTags).toBe(false)
  })

  it('reports a config-level `tag` even when the config declares no testDir', () => {
    // Playwright defaults testDir to the config's own directory, so this yields
    // no scopes — and the flag was being dropped on exactly that branch.
    const path = writeFile('playwright.config.ts', "export default { tag: '@e2e' }\n")
    expect(readSettings(path).declaresTags).toBe(true)
  })

  it('does not mistake an unrelated nested `tag` key for a config-level one', () => {
    const path = writeFile(
      'playwright.config.ts',
      "export default { testDir: './e2e', use: { tag: 'nope' } }\n",
    )
    const read = readSettings(path)
    expect(read.status === 'ok' && read.settings.declaresTags).toBe(false)
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

  it("keeps a project that declares no selectors — Playwright's auth-setup shape", () => {
    // One project declares a testMatch, the browser projects declare nothing and
    // inherit the whole suite. Dropping them analyzed only the setup files and
    // reported a clean score over a fraction of the suite.
    const path = writeFile(
      'playwright.config.ts',
      `export default {
  testDir: './e2e',
  projects: [
    { name: 'setup', testMatch: /.*\\.setup\\.ts/ },
    { name: 'chromium', dependencies: ['setup'] },
    { name: 'firefox', dependencies: ['setup'] },
  ],
}
`,
    )
    const read = readSettings(path)
    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    // setup's regex scope, plus one deduped inherited scope for the browsers.
    expect(read.settings.scopes).toHaveLength(2)
    expect(read.settings.scopes.every((scope) => scope.root === join(dir, 'e2e'))).toBe(true)
    expect(read.settings.scopes[1]?.match).toEqual([])
  })

  it('keeps the base root when projects[] entries are hidden behind a spread', () => {
    // `[...sharedProjects, { … }]`: the invisible entries inherit the base root, so
    // dropping it analyzed only the literal project and scored a clean A on the rest.
    const path = writeFile(
      'playwright.config.ts',
      `import { sharedProjects } from './shared'
export default { testDir: './web', projects: [...sharedProjects, { name: 'api', testDir: './api' }] }
`,
    )
    const read = readSettings(path)
    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.settings.scopes.map((scope) => scope.root)).toEqual([
      join(dir, 'web'),
      join(dir, 'api'),
    ])
    expect(read.unresolved).toContain('projects')
  })

  it('widens (never narrows) when a projects[] entry hides keys behind a spread', () => {
    // The entry may carry its own testDir; falling back to the config directory is the
    // superset it can only be inside. The direction matters — narrowing would be a
    // silent partial scan — so pin it.
    const path = writeFile(
      'playwright.config.ts',
      "import { shared } from './shared'\nexport default { testMatch: '**/*.spec.ts', projects: [{ name: 'a', ...shared }] }\n",
    )
    const read = readSettings(path)
    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.settings.scopes.map((scope) => scope.root)).toEqual([dir])
    expect(read.unresolved).toContain('a spread from another object')
  })

  it('discloses a projects list it cannot see at all', () => {
    const path = writeFile(
      'playwright.config.ts',
      "export default { testDir: './e2e', projects: makeProjects() }\n",
    )
    const read = readSettings(path)
    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.settings.scopes.map((scope) => scope.root)).toEqual([join(dir, 'e2e')])
    expect(read.unresolved).toContain('projects')
  })

  it('preserves RegExp flags', () => {
    const path = writeFile(
      'playwright.config.ts',
      'export default { testMatch: /.*\\.E2E\\.ts/i }\n',
    )
    const read = readSettings(path)
    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.settings.scopes[0]?.match).toEqual([
      { kind: 'regex', source: '.*\\.E2E\\.ts', flags: 'i' },
    ])
  })

  it('skips a project whose testMatch is computed rather than inheriting the base', () => {
    const path = writeFile(
      'playwright.config.ts',
      `export default {
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  projects: [{ name: 'a', testMatch: buildMatch() }, { name: 'b', testDir: './b' }],
}
`,
    )
    const read = readSettings(path)
    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.settings.scopes.map((scope) => scope.root)).toEqual([join(dir, 'b')])
    expect(read.unresolved).toContain('testMatch')
  })

  it('skips a project whose testDir is computed, rather than scanning the parent root', () => {
    const path = writeFile(
      'playwright.config.ts',
      `export default {
  testDir: './e2e',
  projects: [
    { name: 'a', testDir: process.env.DIR, testMatch: '**/*.spec.ts' },
    { name: 'b', testDir: './b' },
  ],
}
`,
    )
    const read = readSettings(path)
    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.settings.scopes.map((scope) => scope.root)).toEqual([join(dir, 'b')])
    expect(read.unresolved).toContain('testDir')
  })

  it('gives every projects[] entry its own root and selectors', () => {
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
      declaresTags: false,
      testIdAttribute: null,
      unresolved: expect.any(Array),
      sawConfigObject: expect.any(Boolean),
    })
  })

  it('separates "declares nothing" from "cannot be read"', () => {
    const bare = writeFile('bare/playwright.config.ts', "export default { reporter: 'list' }\n")
    expect(readSettings(bare)).toEqual({
      status: 'no-settings',
      declaresTags: false,
      testIdAttribute: null,
      unresolved: [],
      sawConfigObject: true,
    })
  })

  it('reports unparseable and absent files without throwing', () => {
    const broken = writeFile('playwright.config.ts', 'export default { testDir: \n')
    expect(readSettings(broken).status).toBe('unreadable')
    expect(readSettings(join(dir, 'nope.config.ts'))).toEqual({
      status: 'unreadable',
      reason: 'file could not be read',
      declaresTags: false,
      testIdAttribute: 'unresolved',
      unresolved: expect.any(Array),
      sawConfigObject: expect.any(Boolean),
    })
  })
})

describe('use.testIdAttribute — what getByTestId() will actually query', () => {
  const attributeOf = (source: string) =>
    readSettings(writeFile('playwright.config.ts', source)).testIdAttribute

  it('reads it from the config and from a project', () => {
    expect(
      attributeOf("export default { testDir: './e2e', use: { testIdAttribute: 'data-qa' } }\n"),
    ).toBe('data-qa')
    expect(
      attributeOf(
        "export default { testDir: './e2e', projects: [{ use: { testIdAttribute: 'data-qa' } }] }\n",
      ),
    ).toBe('data-qa')
  })

  it(`is null when nothing sets it — Playwright's default applies, which is knowledge`, () => {
    expect(attributeOf("export default { testDir: './e2e' }\n")).toBeNull()
  })

  it('is unresolved when a project that declares none would inherit a different value', () => {
    // The second project inherits the config level — unset, so `data-testid`.
    // Folding both into one set answered `data-qa`, which is false there.
    expect(
      attributeOf(
        "export default { testDir: './e2e', projects: [{ use: { testIdAttribute: 'data-qa' } }, {}] }\n",
      ),
    ).toBe('unresolved')
    // ...but a project inheriting an explicit config-level value agrees with it.
    expect(
      attributeOf(
        "export default { testDir: './e2e', use: { testIdAttribute: 'data-qa' }, projects: [{ use: { testIdAttribute: 'data-qa' } }, {}] }\n",
      ),
    ).toBe('data-qa')
  })

  it('is unresolved when it is set but cannot be read', () => {
    expect(
      attributeOf("export default { testDir: './e2e', use: { testIdAttribute: NAME } }\n"),
    ).toBe('unresolved')
    expect(attributeOf("export default { testDir: './e2e', use: base.use }\n")).toBe('unresolved')
    expect(attributeOf("export default { testDir: './e2e', projects: makeProjects() }\n")).toBe(
      'unresolved',
    )
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
    reason: 'it uses a spread from another object',
    declaresTags: false,
    // A spread can carry `use` whole, so the attribute is unknown here.
    testIdAttribute: 'unresolved',
    unresolved: expect.any(Array),
    sawConfigObject: expect.any(Boolean),
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
    expect(resolved.scopes[0]?.matchGlobs).toEqual(['**/*.e2e.ts'])
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
      '**/*.{spec,test,e2e,e2e-spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
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

  it('keeps testIgnore globs as absolute-path matchers, separate from exclude', async () => {
    writeFile(
      'playwright.config.ts',
      "export default { testDir: 'e2e', testIgnore: ['legacy/**', /fixtures/] }\n",
    )
    const resolved = await resolveIn(dir)
    // `exclude` is root-relative by TestPilot's documented semantics; Playwright's
    // testIgnore is matched against the absolute path, so the two cannot be merged.
    expect(resolved.scopes[0]?.excludeGlobs).not.toContain('**/legacy/**')
    expect(resolved.scopes[0]?.ignoreGlobs).toEqual(['**/legacy/**'])
    expect(resolved.scopes[0]?.ignoreRegex).toEqual([{ source: 'fixtures', flags: '' }])
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
    expect(resolved.discovery.playwrightConfigPartial).toBeNull()
  })

  it('treats an explicitly-undefined key as unset, so the fallback still applies', async () => {
    writeFile('playwright.config.ts', "export default { testDir: 'e2e' }\n")
    writeFile('testpilot.config.ts', 'export default { testDir: undefined }\n')
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.testDir).toBe('playwright-config')
    expect(resolved.discovery.roots).toEqual([join(dir, 'e2e')])
  })

  it("adopts a sub-directory config's own directory as the test root when it declares nothing", async () => {
    // Playwright's testDir defaults to the config file's directory. Ignoring that sent
    // us back to `tests/` and scored whatever happened to be there.
    writeFile('e2e/playwright.config.ts', "export default { reporter: 'list' }\n")
    writeFile('e2e/login.spec.ts', "page.locator('//button')\n")
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.roots).toEqual([join(dir, 'e2e')])
    expect(resolved.discovery.testDir).toBe('playwright-config')
  })

  it('does not let a settings-free examples/ config hijack discovery', async () => {
    // Adopting any nearby config's directory would score the demo tree and miss the suite.
    writeFile('examples/playwright.config.ts', "export default { use: { baseURL: 'x' } }\n")
    writeFile('examples/README.md', 'not a test\n')
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.testDir).toBe('default')
    expect(resolved.discovery.playwrightConfigIgnored?.reason).toContain('no test files')
  })

  it('does not silently read a different config when playwrightConfig misses', async () => {
    writeFile('playwright.config.ts', "export default { testDir: 'wrong' }\n")
    writeFile('testpilot.config.ts', "export default { playwrightConfig: './e2e/pw.config.ts' }\n")
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.playwrightConfigPath).toBeNull()
    expect(resolved.discovery.playwrightConfigIgnored?.reason).toContain('does not exist')
  })

  it('merges defineConfig layers per key, with later layers winning', () => {
    writeFile(
      'playwright.config.ts',
      "import { defineConfig } from '@playwright/test'\nexport default defineConfig({ testDir: './e2e' }, { testMatch: '**/*.spec.ts' })\n",
    )
    const read = readSettings(join(dir, 'playwright.config.ts'))
    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    // Taking one whole layer dropped the other's testDir and widened the scan to the
    // project root, scoring files Playwright never runs.
    expect(read.settings.scopes[0]?.root).toBe(join(dir, 'e2e'))
    expect(read.settings.scopes[0]?.match).toEqual([{ kind: 'glob', value: '**/*.spec.ts' }])
    expect(read.unresolved).toEqual([])
  })

  it('refuses to synthesize a test root when a config layer could not be read', () => {
    // The unread layer may be the one that set testDir; defaulting to the config's
    // own directory would scan the whole project and score unit tests.
    writeFile(
      'playwright.config.ts',
      "import base from './base'\nimport { defineConfig } from '@playwright/test'\nexport default defineConfig(base, { testMatch: '**/*.smoke.ts' })\n",
    )
    const read = readSettings(join(dir, 'playwright.config.ts'))
    expect(read.status).toBe('unreadable')
  })

  it('does not unwrap a call that is not a Playwright config helper', () => {
    // `makeConfig` can rewrite what it is given; adopting its argument produced a
    // confident score over a directory Playwright never runs.
    writeFile(
      'playwright.config.ts',
      "import { makeConfig } from './tooling'\nexport default makeConfig({ testDir: './fixtures' })\n",
    )
    const read = readSettings(join(dir, 'playwright.config.ts'))
    expect(read.status).toBe('unreadable')
    if (read.status !== 'unreadable') return
    expect(read.reason).toContain('makeConfig()')
  })

  it('keeps the base root when a bare base sits beside hidden project entries', async () => {
    // The hidden entries inherit the config's own directory; dropping it scored only
    // the literal project and reported a clean grade on the rest.
    writeFile(
      'playwright.config.ts',
      "const common = [{ name: 'firefox' }]\nexport default { projects: [{ name: 'chromium', testDir: './a' }, ...common] }\n",
    )
    const read = readSettings(join(dir, 'playwright.config.ts'))
    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.settings.scopes.map((scope) => scope.root)).toEqual([dir, join(dir, 'a')])
  })

  it('discloses a bare root config rather than silently using the built-in testDir', async () => {
    writeFile('playwright.config.ts', "export default { use: { baseURL: 'x' } }\n")
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.testDir).toBe('default')
    expect(resolved.discovery.playwrightConfigIgnored?.reason).toContain('whole project root')
  })

  it('reports a partially-read config separately from an unusable one', async () => {
    writeFile(
      'playwright.config.ts',
      "import base from './base'\nexport default { ...base, testDir: './e2e' }\n",
    )
    const resolved = await resolveIn(dir)
    // It WAS used — saying "not used" would send the user to fix the wrong thing.
    expect(resolved.discovery.playwrightConfigPath).toBe(join(dir, 'playwright.config.ts'))
    expect(resolved.discovery.playwrightConfigIgnored).toBeNull()
    expect(resolved.discovery.playwrightConfigPartial?.reason).toContain('spread')
  })

  it('adds helper globs only when asked, anchored beside the test root', async () => {
    writeFile('playwright.config.ts', "export default { testDir: './e2e/tests' }\n")
    const off = await resolveIn(dir)
    expect(off.scopes[0]?.helperGlobs).toEqual([])

    const loaded = await loadConfig({ cwd: dir })
    const on = resolveDiscovery(loaded, { rootDir: dir, includeHelpers: true })
    // Helpers sit beside the test root far more often than inside it, so the scan
    // anchors at the config's directory rather than at `testDir`.
    expect(on.scopes[0]?.helperGlobs).toContain('**/page-objects/**')
    expect(on.scopes[0]?.helperRoot).toBe(dir)
    expect(on.scopes[0]?.root).toBe(join(dir, 'e2e/tests'))
  })

  it('pins the default helper patterns, so removing one is a deliberate act', () => {
    // `pages/` was removed once for safety and restored once the content gate made
    // directory names non-load-bearing; both moves were invisible to the suite.
    expect(DEFAULT_HELPER_PATTERNS).toEqual([
      '**/pages/**',
      '**/page-objects/**',
      '**/pageobjects/**',
      '**/pom/**',
      '**/fixtures/**',
      '**/helpers/**',
      '**/support/**',
    ])
  })

  it("uses the project's own helper patterns when it names them", async () => {
    writeFile('playwright.config.ts', "export default { testDir: './e2e' }\n")
    writeFile('testpilot.config.ts', "export default { includeHelpers: ['**/po/**'] }\n")
    const resolved = await resolveIn(dir)
    // Naming them is itself the opt-in; no flag required.
    expect(resolved.scopes[0]?.helperGlobs).toEqual(['**/po/**'])
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
      playwrightConfigPartial: null,
      playwrightConfigDeclaresTags: false,
      playwrightTestIdAttribute: null,
    })
  })

  it('applies both exclude and testIgnore, and says the provenance is mixed', async () => {
    writeFile(
      'playwright.config.ts',
      "export default { testDir: 'e2e', testIgnore: '**/theirs/**' }\n",
    )
    writeFile('testpilot.config.ts', "export default { exclude: ['**/mine/**'] }\n")
    const resolved = await resolveIn(dir)
    // Discarding testIgnore gated on files Playwright never runs; claiming
    // `testpilot-config` for the union hid which glob actually dropped a file.
    expect(resolved.discovery.exclude).toBe('mixed')
    expect(resolved.scopes[0]?.excludeGlobs).toEqual(['**/mine/**'])
    expect(resolved.scopes[0]?.ignoreGlobs).toEqual(['**/theirs/**'])
  })

  it('marks exclude as Playwright-sourced when only a RegExp testIgnore filtered', async () => {
    writeFile('playwright.config.ts', "export default { testDir: 'e2e', testIgnore: /slow/ }\n")
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.exclude).toBe('playwright-config')
  })
})

describe('config-level tag detection across discovery paths', () => {
  it('reports a config `tag` even when an explicit testDir ends adoption', async () => {
    // `testpilot init` writes an explicit testDir, so this is the default shape
    // of a TestPilot project. Missing the tag here made `tags` count the wrong
    // set and `doctor` call a correct suite a typo.
    writeFile('playwright.config.ts', "export default { testDir: './tests', tag: '@cfgtag' }\n")
    writeFile('testpilot.config.ts', "export default { testDir: 'tests' }\n")
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.playwrightConfigDeclaresTags).toBe(true)
    // Adoption is still off: the explicit testDir wins, exactly as before.
    expect(resolved.discovery.testDir).toBe('testpilot-config')
  })

  it('reports no config tag when there is none', async () => {
    writeFile('playwright.config.ts', "export default { testDir: './tests' }\n")
    writeFile('testpilot.config.ts', "export default { testDir: 'tests' }\n")
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.playwrightConfigDeclaresTags).toBe(false)
  })

  it('hedges when a `tag` could hide behind a spread', async () => {
    // `defineConfig({ ...base, testDir })` — the spread is exactly the region a
    // `tag` key can hide in, so "no tag" there is a guess, not a reading.
    writeFile(
      'playwright.config.ts',
      "const base = { tag: '@cfgtag' }\nexport default defineConfig({ ...base, testDir: './tests' })\n",
    )
    writeFile('testpilot.config.ts', "export default { testDir: 'tests' }\n")
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.playwrightConfigDeclaresTags).toBe(true)
  })

  it('hedges when the config cannot be read at all', async () => {
    writeFile('playwright.config.ts', "export default makeConfig({ tag: '@cfgtag' })\n")
    writeFile('testpilot.config.ts', "export default { testDir: 'tests' }\n")
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.playwrightConfigDeclaresTags).toBe(true)
  })

  it('does not hedge on an ordinary non-literal testDir, which cannot hide a tag', async () => {
    writeFile('playwright.config.ts', 'export default { testDir: DIR }\n')
    writeFile('testpilot.config.ts', "export default { testDir: 'tests' }\n")
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.playwrightConfigDeclaresTags).toBe(false)
  })

  it('reads a config the `playwrightConfig` hint points at, even in a sub-directory', async () => {
    // `run` honours the hint, so the probe has to as well. Filtering the nearby
    // search by directory looked equivalent and silently dropped this case.
    writeFile('e2e/playwright.config.ts', "export default { testDir: './tests', tag: '@cfgtag' }\n")
    writeFile('e2e/tests/a.spec.ts', "test('x', async () => {})\n")
    writeFile(
      'testpilot.config.ts',
      "export default { testDir: 'e2e/tests', playwrightConfig: 'e2e/playwright.config.ts' }\n",
    )
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.playwrightConfigDeclaresTags).toBe(true)
  })

  it('falls back to the root config when the hint points at nothing, as run does', async () => {
    writeFile('playwright.config.ts', "export default { testDir: './tests', tag: '@cfgtag' }\n")
    writeFile(
      'testpilot.config.ts',
      "export default { testDir: 'tests', playwrightConfig: 'nope.config.ts' }\n",
    )
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.playwrightConfigDeclaresTags).toBe(true)
  })

  it('ignores a config one directory down, which governs its own tests', async () => {
    // `testpilot run` starts Playwright at the project root, so an examples/
    // demo config cannot tag this suite — hedging on it would suppress real counts.
    writeFile('examples/playwright.config.ts', "export default { tag: '@demo' }\n")
    writeFile('examples/tests/a.spec.ts', "test('x', async () => {})\n")
    writeFile('testpilot.config.ts', "export default { testDir: 'tests' }\n")
    const resolved = await resolveIn(dir)
    expect(resolved.discovery.playwrightConfigDeclaresTags).toBe(false)
  })

  it('reports a config tag even with --no-playwright-discovery', async () => {
    // The flag turns off *adoption*; it cannot make a declared tag stop applying.
    writeFile('playwright.config.ts', "export default { testDir: './tests', tag: '@cfgtag' }\n")
    const resolved = await resolveIn(dir, { disable: true })
    expect(resolved.discovery.playwrightConfigDeclaresTags).toBe(true)
  })
})
