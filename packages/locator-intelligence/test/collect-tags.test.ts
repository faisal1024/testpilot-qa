import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_DISCOVERY, type TestPilotConfig, defaultConfig } from '@testpilot/core'
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
      { tag: 'smoke', tests: 3, files: 2, sources: ['title'], selectable: true },
      { tag: 'slow', tests: 1, files: 1, sources: ['title'], selectable: true },
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
        all: [],
        exclude: ['flaky'],
        unknownTags: [],
        unknownExcludedTags: [],
        matchingTests: 1,
        malformed: false,
      },
      {
        name: 'smoke',
        include: ['smoke'],
        all: [],
        exclude: [],
        unknownTags: [],
        unknownExcludedTags: [],
        matchingTests: 1,
        malformed: false,
      },
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

  it('warns when files were scanned but no test() was recognized', async () => {
    // `import { test as setup }` — Playwright's own auth pattern. The walk keys
    // on the name `test`, so "no tags found" would answer a question we never
    // managed to ask.
    write('tests/auth.spec.ts', "setup('authenticate @smoke', async () => {})")
    write('tests/a.spec.ts', "setup('other @smoke', async () => {})")
    const report = await collectTags({ cwd: dir, config: config() })
    expect(report.summary.tests).toBe(0)
    expect(report.warnings.map((w) => w.code)).toContain('no-tests-recognized')
  })

  it('does not cry "no tests recognized" when the files simply failed to parse', async () => {
    write('tests/a.spec.ts', 'const = = =')
    const report = await collectTags({ cwd: dir, config: config() })
    const codes = report.warnings.map((w) => w.code)
    expect(codes).toContain('files-not-parsed')
    expect(codes).not.toContain('no-tests-recognized')
  })

  it('discloses tag expressions it could not read', async () => {
    write('tests/a.spec.ts', "test('x @known', { tag: [...COMMON] }, async () => {})")
    const report = await collectTags({ cwd: dir, config: config() })
    expect(report.summary.unreadableTagExpressions).toBe(1)
    expect(report.warnings.map((w) => w.code)).toContain('unreadable-tag-expressions')
  })

  it('records how each tag was written', async () => {
    write(
      'tests/a.spec.ts',
      [
        "test('mentions @here in the composer', async () => {})",
        "test('checkout', { tag: ['@smoke'] }, async () => {})",
      ].join('\n'),
    )
    const report = await collectTags({ cwd: dir, config: config() })
    const byTag = Object.fromEntries(report.tags.map((usage) => [usage.tag, usage.sources]))
    expect(byTag.here).toEqual(['title'])
    expect(byTag.smoke).toEqual(['details'])
  })

  it('flags a tag --tag cannot select', async () => {
    // Playwright reads `@a,@b` as one tag; our comma splitting cannot express it.
    write('tests/a.spec.ts', "test('x @a,@b', async () => {})")
    const report = await collectTags({ cwd: dir, config: config() })
    expect(report.tags[0]).toMatchObject({ tag: 'a,@b', selectable: false })
    expect(report.warnings.map((w) => w.code)).toContain('unselectable-tags')
  })

  it('refuses to count a malformed suite instead of matching every test', async () => {
    write('tests/a.spec.ts', "test('1 @x', async () => {})\ntest('2', async () => {})")
    const report = await collectTags({
      cwd: dir,
      config: config({ suites: { bad: ['has space'] } }),
    })
    // An empty selection would otherwise match everything and print a count.
    expect(report.suites[0]).toMatchObject({ malformed: true, matchingTests: null })
  })

  it('refuses to count when the vocabulary is knowingly incomplete', async () => {
    write(
      'tests/a.spec.ts',
      [
        "test('1 @regression', async () => {})",
        "test('2', { tag: [...COMMON] }, async () => {})",
      ].join('\n'),
    )
    const report = await collectTags({
      cwd: dir,
      config: config({ suites: { nightly: ['regression'] } }),
    })
    // The second test may carry @regression; a count of 1 would be a lower
    // bound stated as a fact.
    expect(report.summary.unreadableTagExpressions).toBe(1)
    expect(report.suites[0]?.matchingTests).toBeNull()
  })

  it('discloses a title it cannot read', async () => {
    write('tests/a.spec.ts', 'for (const n of C) { test(n, async () => {}) }')
    const report = await collectTags({ cwd: dir, config: config() })
    expect(report.summary.tests).toBe(1)
    expect(report.summary.unreadableTitles).toBe(1)
    expect(report.warnings.map((w) => w.code)).toContain('unreadable-test-titles')
  })

  it('still reports unrecognized tests when another file failed to parse', async () => {
    // A parse error elsewhere must not suppress this disclosure.
    write('tests/a.spec.ts', "setup('one @smoke', async () => {})")
    write('tests/broken.spec.ts', 'const = = =')
    const report = await collectTags({ cwd: dir, config: config() })
    const codes = report.warnings.map((w) => w.code)
    expect(codes).toContain('files-not-parsed')
    expect(codes).toContain('no-tests-recognized')
  })

  it.each([
    // `--tag -wip` parses the `-` as negation and would silently EXCLUDE @wip.
    ['x @-wip', '-wip', false],
    // `--tag` splits on commas, so this one tag becomes two.
    ['x @a,@b', 'a,@b', false],
    ['x @smoke', 'smoke', true],
    ['x @team:auth', 'team:auth', true],
    // A dot is fine when the tag stands on its own.
    ['x @smoke.example', 'smoke.example', true],
  ])('marks the tag in %j selectable=%s', async (title, tag, expected) => {
    write('tests/a.spec.ts', `test('${title}', async () => {})`)
    const report = await collectTags({ cwd: dir, config: config() })
    expect(report.tags.find((usage) => usage.tag === tag)?.selectable).toBe(expected)
  })

  it('marks a tag that only ever appears fused to a word as unselectable', async () => {
    // Playwright reads @smoke.example here; our leading boundary deliberately
    // will not, so `--tag smoke.example` would select nothing.
    write('tests/a.spec.ts', "test('notify user@smoke.example now', async () => {})")
    const report = await collectTags({ cwd: dir, config: config() })
    expect(report.tags[0]).toMatchObject({ tag: 'smoke.example', selectable: false })
    expect(report.warnings.map((w) => w.code)).toContain('unselectable-tags')
  })

  it('marks it selectable when the same tag also appears standalone somewhere', async () => {
    write(
      'tests/a.spec.ts',
      [
        "test('notify user@smoke.example now', async () => {})",
        "test('real @smoke.example', async () => {})",
      ].join('\n'),
    )
    const report = await collectTags({ cwd: dir, config: config() })
    expect(report.tags[0]?.selectable).toBe(true)
  })

  it('refuses to count an empty suite, which run and doctor both reject', async () => {
    write('tests/a.spec.ts', "test('1 @x', async () => {})\ntest('2', async () => {})")
    const report = await collectTags({
      cwd: dir,
      config: config({ suites: { emptyList: [], emptyObj: { any: [], all: [], none: [] } } }),
    })
    for (const suite of report.suites) {
      expect(suite).toMatchObject({ malformed: true, matchingTests: null })
    }
  })

  it('does not call a suite tag a typo when the vocabulary is incomplete', async () => {
    // @regression exists; the loop title just cannot be read. Accusing the
    // config is the same error as missing a real typo, in the other direction.
    write(
      'tests/a.spec.ts',
      ["for (const n of NAMES) { test(n + ' @regression', async () => {}) }"].join('\n'),
    )
    const report = await collectTags({
      cwd: dir,
      config: config({ suites: { nightly: ['regression'] } }),
    })
    expect(report.summary.vocabularyComplete).toBe(false)
  })

  it('reports a complete vocabulary for an ordinary suite, so counts still work', async () => {
    write('tests/a.spec.ts', "test('1 @regression', async () => {})")
    const report = await collectTags({
      cwd: dir,
      config: config({ suites: { nightly: ['regression'] } }),
    })
    expect(report.summary.vocabularyComplete).toBe(true)
    expect(report.suites[0]?.matchingTests).toBe(1)
  })

  it('marks the vocabulary incomplete when a declared test root is missing', async () => {
    write('tests/a.spec.ts', "test('1 @x', async () => {})")
    const report = await collectTags({
      cwd: dir,
      config: config(),
      discovery: { ...DEFAULT_DISCOVERY, roots: [join(dir, 'tests'), join(dir, 'gone')] },
    })
    expect(report.warnings.map((w) => w.code)).toContain('test-root-missing')
    expect(report.summary.vocabularyComplete).toBe(false)
  })

  it('counts a suite over selectable occurrences only', async () => {
    // `user@dual` is a tag to Playwright but unreachable by --tag, so promising
    // 2 tests would overstate what `run --suite d` actually runs.
    write(
      'tests/a.spec.ts',
      ["test('anchored @dual', async () => {})", "test('fused user@dual', async () => {})"].join(
        '\n',
      ),
    )
    const report = await collectTags({
      cwd: dir,
      config: config({ suites: { d: ['dual'] } }),
    })
    expect(report.suites[0]?.matchingTests).toBe(1)
  })

  it('discloses a describe whose body is not inlined, and stops claiming completeness', async () => {
    write('tests/a.spec.ts', "test.describe('desktop @shared', sharedTests)")
    const report = await collectTags({ cwd: dir, config: config({ suites: { d: ['shared'] } }) })
    expect(report.warnings.map((w) => w.code)).toContain('describe-body-not-inlined')
    expect(report.summary.vocabularyComplete).toBe(false)
    // The suite is not accused of a typo over a tag we admit we could not read.
    expect(report.suites[0]?.matchingTests).toBeNull()
  })

  it('discloses a renamed-import file even when other files are normal', async () => {
    // The whole-run condition never fired in the mixed case real repos have
    // (Ghost's global.setup.ts, mattermost's test_setup.ts).
    write('tests/normal.spec.ts', "test('one @smoke', async () => {})")
    write('tests/auth.spec.ts', "setup('authenticate @smoke', async () => {})")
    const report = await collectTags({ cwd: dir, config: config() })
    expect(report.summary.tests).toBe(1)
    expect(report.warnings.map((w) => w.code)).toContain('no-tests-recognized')
    expect(report.summary.vocabularyComplete).toBe(false)
  })

  it('does not suppress the count for an exclusion nobody carries', async () => {
    // The README's own nightly example, before anyone tags @flaky.
    write('tests/a.spec.ts', "test('1 @regression', async () => {})")
    const report = await collectTags({
      cwd: dir,
      config: config({ suites: { nightly: ['regression', '!flaky'] } }),
    })
    expect(report.suites[0]).toMatchObject({
      unknownTags: [],
      unknownExcludedTags: ['flaky'],
      matchingTests: 1,
    })
  })

  it('does not accuse a suite over a describe title it could not read', async () => {
    write(
      'tests/a.spec.ts',
      [
        "test.describe(GROUP, () => { test('hidden', async () => {}) })",
        "test('visible', { tag: ['@regression'] }, async () => {})",
      ].join('\n'),
    )
    const report = await collectTags({
      cwd: dir,
      config: config({ suites: { n: ['regression'] } }),
    })
    expect(report.summary.unreadableTitles).toBe(1)
    expect(report.summary.vocabularyComplete).toBe(false)
    expect(report.suites[0]?.matchingTests).toBeNull()
  })

  it('does not accuse a suite over a details argument it could not read', async () => {
    write(
      'tests/a.spec.ts',
      ["const OPTS = { tag: ['@regression'] }", "test('via variable', OPTS, async () => {})"].join(
        '\n',
      ),
    )
    const report = await collectTags({
      cwd: dir,
      config: config({ suites: { n: ['regression'] } }),
    })
    expect(report.summary.unreadableTagExpressions).toBe(1)
    expect(report.summary.vocabularyComplete).toBe(false)
  })

  it('says the scan was pattern-restricted, so the vocabulary is of a subset', async () => {
    // The suite lines claim things about `run --suite X`, which never takes
    // patterns — so a narrowed scan must not read as the whole vocabulary.
    write('tests/a.spec.ts', "test('1 @regression', async () => {})")
    write('tests/b.spec.ts', "test('2 @smoke', async () => {})")
    const report = await collectTags({
      cwd: dir,
      config: config({ suites: { s: ['smoke'] } }),
      patterns: ['tests/a.spec.ts'],
    })
    expect(report.warnings.map((w) => w.code)).toContain('scan-restricted-to-patterns')
    expect(report.summary.vocabularyComplete).toBe(false)
    expect(report.suites[0]?.matchingTests).toBeNull()
  })

  it('resolves an all-of suite', async () => {
    write(
      'tests/a.spec.ts',
      [
        "test('1 @regression @critical', async () => {})",
        "test('2 @regression', async () => {})",
      ].join('\n'),
    )
    const report = await collectTags({
      cwd: dir,
      config: config({ suites: { hard: { any: [], all: ['regression', 'critical'], none: [] } } }),
    })
    expect(report.suites[0]).toMatchObject({
      include: [],
      all: ['regression', 'critical'],
      matchingTests: 1,
    })
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
