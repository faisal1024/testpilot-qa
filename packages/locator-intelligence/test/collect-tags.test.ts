import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type TestPilotConfig, defaultConfig } from '@testpilot/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectTags } from '../src/tags/collect-tags.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'testpilot-tags-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function write(relativePath: string, content: string): void {
  const full = join(dir, relativePath)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
}

function config(overrides: Partial<TestPilotConfig> = {}): TestPilotConfig {
  return { ...defaultConfig, ...overrides }
}

describe('collectTags', () => {
  it('counts tests and files per tag', async () => {
    write(
      'tests/a.spec.ts',
      "test('one @smoke', async () => {})\ntest('two @smoke', async () => {})",
    )
    write('tests/b.spec.ts', "test('three @smoke @slow', async () => {})")
    const report = await collectTags({ cwd: dir, config: config() })
    expect(report.tags).toEqual([
      { tag: 'smoke', tests: 3, files: 2 },
      { tag: 'slow', tests: 1, files: 1 },
    ])
    expect(report.summary).toMatchObject({
      tests: 3,
      taggedTests: 3,
      untaggedTests: 0,
      distinctTags: 2,
      filesAnalyzed: 2,
    })
  })

  it('counts untagged tests', async () => {
    write('tests/a.spec.ts', "test('one @smoke', async () => {})\ntest('two', async () => {})")
    const report = await collectTags({ cwd: dir, config: config() })
    expect(report.summary).toMatchObject({ tests: 2, taggedTests: 1, untaggedTests: 1 })
  })

  it('sorts by count, then alphabetically', async () => {
    write(
      'tests/a.spec.ts',
      [
        "test('1 @b @z', async () => {})",
        "test('2 @b @a', async () => {})",
        "test('3 @b', async () => {})",
      ].join('\n'),
    )
    const report = await collectTags({ cwd: dir, config: config() })
    expect(report.tags.map((usage) => usage.tag)).toEqual(['b', 'a', 'z'])
  })

  it('warns rather than presenting a total when a file will not parse', async () => {
    write('tests/ok.spec.ts', "test('one @smoke', async () => {})")
    write('tests/broken.spec.ts', 'const = = =')
    const report = await collectTags({ cwd: dir, config: config() })
    expect(report.parseErrors).toHaveLength(1)
    expect(report.warnings.map((w) => w.code)).toContain('files-not-parsed')
  })

  it('warns that dynamic titles bound the vocabulary', async () => {
    write('tests/a.spec.ts', 'test(`case ${n}`, async () => {})')
    const report = await collectTags({ cwd: dir, config: config() })
    expect(report.summary.dynamicTitles).toBe(1)
    expect(report.warnings.map((w) => w.code)).toContain('dynamic-test-titles')
  })

  it('says an empty vocabulary is not the same as no tags when nothing matched', async () => {
    const report = await collectTags({ cwd: dir, config: config() })
    const warning = report.warnings.find((w) => w.code === 'no-files-matched')
    expect(warning?.message).toMatch(/not the same as/)
  })

  it('resolves configured suites against the real vocabulary', async () => {
    write(
      'tests/a.spec.ts',
      [
        "test('1 @regression', async () => {})",
        "test('2 @regression @flaky', async () => {})",
        "test('3 @smoke', async () => {})",
      ].join('\n'),
    )
    const report = await collectTags({
      cwd: dir,
      config: config({ suites: { nightly: ['regression', '!flaky'], smoke: ['smoke'] } }),
    })
    expect(report.suites).toEqual([
      {
        name: 'nightly',
        include: ['regression'],
        exclude: ['flaky'],
        unknownTags: [],
        matchingTests: 1,
      },
      { name: 'smoke', include: ['smoke'], exclude: [], unknownTags: [], matchingTests: 1 },
    ])
  })

  it('reports a suite tag no test carries and refuses to guess a count', async () => {
    write('tests/a.spec.ts', "test('1 @regression', async () => {})")
    const report = await collectTags({
      cwd: dir,
      config: config({ suites: { nightly: ['regresion'] } }),
    })
    expect(report.suites[0]).toMatchObject({ unknownTags: ['regresion'], matchingTests: null })
  })

  it('ignores helper files, which declare no tests', async () => {
    write('tests/a.spec.ts', "test('1 @smoke', async () => {})")
    write('tests/pages/login.ts', "export const x = () => page.locator('.a')")
    const report = await collectTags({ cwd: dir, config: config() })
    expect(report.summary.filesAnalyzed).toBe(1)
  })

  it('reports rootDir absolutely, like analyze', async () => {
    write('tests/a.spec.ts', "test('1', async () => {})")
    const report = await collectTags({ cwd: dir, config: config() })
    expect(report.rootDir.startsWith('/')).toBe(true)
    expect(report.command).toBe('tags')
    expect(report.schemaVersion).toBe('1.0')
  })
})
