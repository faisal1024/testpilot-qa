import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { type DiscoveryScope, defaultConfig } from '@testpilot/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveFiles, resolveTestFiles } from '../src/resolve-files.js'

/**
 * The selection layer, exercised end to end against real files. Every discovery bug
 * that survived review lived here rather than in the parser, so these pin the
 * semantics — Playwright's absolute-path matchers, per-scope ignores, the
 * unconditional `node_modules` guard — against real trees.
 */

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'testpilot-resolve-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function write(relativePath: string): string {
  const full = join(dir, relativePath)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, "page.locator('//button')\n")
  return full
}

function scope(overrides: Partial<DiscoveryScope> & { root: string }): DiscoveryScope {
  return {
    includeGlobs: [],
    matchGlobs: [],
    matchRegex: [],
    excludeGlobs: defaultConfig.exclude,
    helperGlobs: [],
    helperRoot: overrides.root,
    ignoreGlobs: [],
    ignoreRegex: [],
    ...overrides,
  }
}

const found = async (scopes: DiscoveryScope[]) =>
  (await resolveTestFiles({ cwd: dir, config: defaultConfig, rootDir: dir, scopes }))
    .map((file) => relative(dir, file).split('\\').join('/'))
    .sort()

describe('resolveTestFiles — Playwright selector semantics', () => {
  it('matches testMatch globs against the absolute path, not relative to the root', async () => {
    write('e2e/smoke/s.spec.ts')
    write('e2e/full/f.spec.ts')
    // A pattern naming a segment at or above testDir matched nothing when these were
    // resolved relative to the scope root.
    expect(
      await found([
        scope({ root: join(dir, 'e2e/smoke'), matchGlobs: ['**/e2e/smoke/**/*.spec.ts'] }),
        scope({ root: join(dir, 'e2e/full'), matchGlobs: ['**/*.spec.ts'] }),
      ]),
    ).toEqual(['e2e/full/f.spec.ts', 'e2e/smoke/s.spec.ts'])
  })

  it('honors RegExp flags', async () => {
    write('e2e/cart.E2E.ts')
    expect(
      await found([
        scope({ root: join(dir, 'e2e'), matchRegex: [{ source: '.*\\.e2e\\.ts', flags: 'i' }] }),
      ]),
    ).toEqual(['e2e/cart.E2E.ts'])
    expect(
      await found([
        scope({ root: join(dir, 'e2e'), matchRegex: [{ source: '.*\\.e2e\\.ts', flags: '' }] }),
      ]),
    ).toEqual([])
  })

  it('matches testIgnore globs against the absolute path too', async () => {
    write('e2e/keep.spec.ts')
    write('e2e/legacy/old.spec.ts')
    expect(
      await found([
        scope({
          root: join(dir, 'e2e'),
          matchGlobs: ['**/*.spec.ts'],
          ignoreGlobs: ['**/e2e/legacy/**'],
        }),
      ]),
    ).toEqual(['e2e/keep.spec.ts'])
  })

  it("does not let one scope's ignore delete another scope's files", async () => {
    write('web/a.spec.ts')
    write('web/legacy/keep.spec.ts')
    write('embeds/legacy/drop.spec.ts')
    expect(
      await found([
        scope({ root: join(dir, 'web'), includeGlobs: ['**/*.spec.ts'] }),
        scope({
          root: join(dir, 'embeds'),
          includeGlobs: ['**/*.spec.ts'],
          ignoreGlobs: ['**/legacy/**'],
        }),
      ]),
    ).toEqual(['web/a.spec.ts', 'web/legacy/keep.spec.ts'])
  })

  it('finds candidates inside dot-directories, as Playwright does', async () => {
    write('e2e/.hidden/a.check.ts')
    write('e2e/b.check.ts')
    expect(await found([scope({ root: join(dir, 'e2e'), matchGlobs: ['**/*.check.ts'] })])).toEqual(
      ['e2e/.hidden/a.check.ts', 'e2e/b.check.ts'],
    )
  })

  it('never returns node_modules, even when the config replaces exclude', async () => {
    write('e2e/a.spec.ts')
    write('e2e/node_modules/dep/b.spec.ts')
    expect(
      await found([
        scope({ root: join(dir, 'e2e'), includeGlobs: ['**/*.spec.ts'], excludeGlobs: [] }),
      ]),
    ).toEqual(['e2e/a.spec.ts'])
    expect(
      await found([
        scope({ root: join(dir, 'e2e'), matchGlobs: ['**/*.spec.ts'], excludeGlobs: [] }),
      ]),
    ).toEqual(['e2e/a.spec.ts'])
  })

  it('applies the user exclude and the Playwright ignore together', async () => {
    write('e2e/keep.spec.ts')
    write('e2e/slow/b.spec.ts')
    write('e2e/fixtures/c.spec.ts')
    // Discarding either one gates on files the other tool never runs.
    expect(
      await found([
        scope({
          root: join(dir, 'e2e'),
          includeGlobs: ['**/*.spec.ts'],
          excludeGlobs: ['**/fixtures/**'],
          ignoreGlobs: ['**/e2e/slow/**'],
        }),
      ]),
    ).toEqual(['e2e/keep.spec.ts'])
  })

  describe('helper discovery', () => {
    const playwrightFile = (path: string) => {
      const full = write(path)
      writeFileSync(
        full,
        "import type { Page } from '@playwright/test'\nexport const f = (p: Page) => p.locator('.x')\n",
      )
      return full
    }

    it('requires a Playwright signal, so a directory name alone is not evidence', async () => {
      write('e2e/a.spec.ts')
      playwrightFile('helpers/po.ts')
      const plain = write('helpers/date.js')
      writeFileSync(plain, 'export const f = (d) => d.toISOString()\n')
      const found = await resolveFiles({
        cwd: dir,
        config: defaultConfig,
        rootDir: dir,
        scopes: [
          scope({
            root: join(dir, 'e2e'),
            includeGlobs: defaultConfig.include,
            helperGlobs: ['**/helpers/**'],
            helperRoot: dir,
          }),
        ],
      })
      expect([...found.helpers].map((f) => relative(dir, f))).toEqual(['helpers/po.ts'])
    })

    it('never scans helpers when the suite itself was not found', async () => {
      // Otherwise a wrong testDir stops being a hard failure and starts scoring the
      // helper layer alone — turning a red gate green.
      playwrightFile('helpers/po.ts')
      const found = await resolveFiles({
        cwd: dir,
        config: defaultConfig,
        rootDir: dir,
        scopes: [
          scope({
            root: join(dir, 'nope'),
            includeGlobs: defaultConfig.include,
            helperGlobs: ['**/helpers/**'],
            helperRoot: dir,
          }),
        ],
      })
      expect(found.files).toEqual([])
      expect(found.helpers.size).toBe(0)
    })

    it('keeps a spec that lives under a helper directory a test', async () => {
      const spec = write('e2e/helpers/shared.spec.ts')
      writeFileSync(
        spec,
        "import { test } from '@playwright/test'\ntest('a', async ({ page }) => page.locator('.x'))\n",
      )
      const found = await resolveFiles({
        cwd: dir,
        config: defaultConfig,
        rootDir: dir,
        scopes: [
          scope({
            root: join(dir, 'e2e'),
            includeGlobs: defaultConfig.include,
            helperGlobs: ['**/helpers/**'],
            helperRoot: dir,
          }),
        ],
      })
      expect(found.files.map((f) => relative(dir, f))).toEqual([
        join('e2e', 'helpers', 'shared.spec.ts'),
      ])
      expect(found.helpers.size).toBe(0)
    })

    it('counts only helpers that survived the ignore filters', async () => {
      write('e2e/a.spec.ts')
      playwrightFile('helpers/po.ts')
      const found = await resolveFiles({
        cwd: dir,
        config: defaultConfig,
        rootDir: dir,
        scopes: [
          scope({
            root: join(dir, 'e2e'),
            includeGlobs: defaultConfig.include,
            helperGlobs: ['**/helpers/**'],
            helperRoot: dir,
            excludeGlobs: [...defaultConfig.exclude, '**/helpers/**'],
          }),
        ],
      })
      expect(found.helpers.size).toBe(0)
      expect(found.files.every((file) => !file.includes('helpers'))).toBe(true)
    })
  })

  it('deduplicates a file selected by several scopes', async () => {
    write('e2e/a.spec.ts')
    expect(
      await found([
        scope({ root: join(dir, 'e2e'), includeGlobs: ['**/*.spec.ts'] }),
        scope({ root: join(dir, 'e2e'), matchGlobs: ['**/*.spec.ts'] }),
      ]),
    ).toEqual(['e2e/a.spec.ts'])
  })
})
