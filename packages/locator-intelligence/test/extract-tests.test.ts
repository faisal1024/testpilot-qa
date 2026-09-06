import { describe, expect, it } from 'vitest'
import { parseSource } from '../src/parser.js'
import { extractTests } from '../src/tags/extract-tests.js'

function tests(source: string) {
  return extractTests(parseSource(source, 'a.spec.ts')).tests
}

function extracted(source: string) {
  return extractTests(parseSource(source, 'a.spec.ts'))
}

describe('extractTests', () => {
  it('finds a plain test with no tags', () => {
    const found = tests("test('checkout works', async () => {})")
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ title: 'checkout works', effectiveTags: [], line: 1 })
  })

  it('reads @tags from the title', () => {
    expect(tests("test('checkout @smoke @p1', async () => {})")[0]?.effectiveTags).toEqual([
      'p1',
      'smoke',
    ])
  })

  it('reads tags from the details argument, string or array', () => {
    expect(tests("test('a', { tag: '@smoke' }, async () => {})")[0]?.effectiveTags).toEqual([
      'smoke',
    ])
    expect(
      tests("test('a', { tag: ['@smoke', '@slow'] }, async () => {})")[0]?.effectiveTags,
    ).toEqual(['slow', 'smoke'])
  })

  it('merges title and details tags, deduped and sorted', () => {
    expect(
      tests("test('a @smoke', { tag: ['@smoke', '@b'] }, async () => {})")[0]?.effectiveTags,
    ).toEqual(['b', 'smoke'])
  })

  it('inherits tags from an enclosing describe', () => {
    const found = tests(
      [
        "test.describe('billing @regression', () => {",
        "  test('one @smoke', async () => {})",
        "  test('two', async () => {})",
        '})',
      ].join('\n'),
    )
    expect(found.map((t) => t.effectiveTags)).toEqual([['regression', 'smoke'], ['regression']])
    // `ownTags` stays what the test itself declares.
    expect(found[0]?.ownTags).toEqual(['smoke'])
    expect(found[1]?.ownTags).toEqual([])
  })

  it('inherits through nested describes', () => {
    const found = tests(
      [
        "test.describe('a @outer', () => {",
        "  test.describe('b', { tag: '@inner' }, () => {",
        "    test('c', async () => {})",
        '  })',
        '})',
      ].join('\n'),
    )
    expect(found[0]?.effectiveTags).toEqual(['inner', 'outer'])
  })

  it('does not leak a describe tag to a sibling outside it', () => {
    const found = tests(
      [
        "test.describe('a @inside', () => {",
        "  test('one', async () => {})",
        '})',
        "test('two', async () => {})",
      ].join('\n'),
    )
    expect(found[1]?.effectiveTags).toEqual([])
  })

  it.each([
    'test.only',
    'test.skip',
    'test.fixme',
    'test.fail',
    'test.describe.only',
    'test.describe.serial',
    'test.describe.serial.only',
    'test.describe.parallel',
  ])('recognizes %s', (callee) => {
    const source = callee.startsWith('test.describe')
      ? `${callee}('g @t', () => { test('x', async () => {}) })`
      : `${callee}('x @t', async () => {})`
    const found = tests(source)
    expect(found).toHaveLength(1)
    expect(found[0]?.effectiveTags).toEqual(['t'])
  })

  it('ignores in-body modifier calls that declare nothing', () => {
    // `test.skip()` / `test.slow(cond, reason)` inside a body are modifiers.
    const found = tests(
      [
        "test('real @a', async ({ browserName }) => {",
        "  test.skip(browserName === 'webkit', 'not on webkit')",
        '  test.slow()',
        '})',
      ].join('\n'),
    )
    expect(found).toHaveLength(1)
    expect(found[0]?.title).toBe('real @a')
  })

  it('ignores test.describe.configure', () => {
    const found = tests(
      [
        "test.describe('g @tag', () => {",
        "  test.describe.configure({ mode: 'serial' })",
        "  test('x', async () => {})",
        '})',
      ].join('\n'),
    )
    expect(found).toHaveLength(1)
    expect(found[0]?.effectiveTags).toEqual(['tag'])
  })

  it('ignores calls that are not rooted at `test`', () => {
    expect(tests("suite('x @a', async () => {})")).toHaveLength(0)
    expect(tests("describe('x @a', () => {})")).toHaveLength(0)
  })

  it('reads static parts of a dynamic title and marks it', () => {
    const found = tests('test(`case ${n} @smoke`, async () => {})')
    expect(found[0]).toMatchObject({ dynamicTitle: true, effectiveTags: ['smoke'] })
  })

  it('does not fuse text across an interpolation into a tag', () => {
    // `@${x}` must not read as the tag `@` plus whatever follows the hole.
    const found = tests('test(`a @${x}suffix`, async () => {})')
    expect(found[0]?.effectiveTags).toEqual([])
  })

  it('handles a describe with no title', () => {
    const found = tests("test.describe(() => { test('x @a', async () => {}) })")
    expect(found[0]?.effectiveTags).toEqual(['a'])
  })

  it('reports 1-based line and column', () => {
    const found = tests(['', "  test('x', async () => {})"].join('\n'))
    expect(found[0]).toMatchObject({ line: 2, column: 3 })
  })

  it('sorts declarations by position', () => {
    const found = tests(["test('b', async () => {})", "test('a', async () => {})"].join('\n'))
    expect(found.map((t) => t.title)).toEqual(['b', 'a'])
  })

  it('ignores a details object without a tag key', () => {
    expect(
      tests("test('x', { annotation: { type: 'issue' } }, async () => {})")[0]?.effectiveTags,
    ).toEqual([])
  })

  it('counts a tag expression it cannot read rather than dropping it silently', () => {
    const found = tests('test(`x`, { tag: [`@${env}`] }, async () => {})')
    expect(found[0]?.effectiveTags).toEqual([])
    expect(found[0]?.unreadableTags).toBe(1)
  })

  it('counts a spread in the tag array', () => {
    const found = tests("test('x', { tag: [...COMMON, '@b'] }, async () => {})")
    expect(found[0]?.effectiveTags).toEqual(['b'])
    expect(found[0]?.unreadableTags).toBe(1)
  })

  it('counts a variable tag list', () => {
    const found = tests("test('x', { tag: TAGS }, async () => {})")
    expect(found[0]?.effectiveTags).toEqual([])
    expect(found[0]?.unreadableTags).toBe(1)
  })

  it('does not declare a test for test.slow, which has no (title, body) overload', () => {
    // Playwright's TestType.slow is slow() / slow(condition, desc) / slow(cb, desc).
    expect(tests("test.slow('x @t', async () => {})")).toHaveLength(0)
  })

  it('records tag provenance separately from the effective list', () => {
    const found = tests(
      [
        "test.describe('grp @inherited', () => {",
        "  test('one @fromTitle', { tag: ['@fromDetails'] }, async () => {})",
        '})',
      ].join('\n'),
    )
    // Provenance is effective, like the tag list: a describe-level tag is the
    // most deliberate vocabulary there is and must not be invisible.
    expect(found[0]).toMatchObject({
      titleTags: ['fromTitle', 'inherited'],
      detailTags: ['fromDetails'],
      effectiveTags: ['fromDetails', 'fromTitle', 'inherited'],
    })
  })

  it('does not read a tag fused to an interpolation', () => {
    // `@smoke${x}` produces the tag `@smokeX` at runtime, so reporting `@smoke`
    // would name a tag no test carries and `--tag smoke` would run nothing.
    expect(tests('test(`@smoke${x} adjacent`, async () => {})')[0]?.effectiveTags).toEqual([])
    expect(tests('test(`a ${x}@smoke`, async () => {})')[0]?.effectiveTags).toEqual([])
    // A tag with whitespace on both sides is still readable.
    expect(tests('test(`a @smoke ${x} b`, async () => {})')[0]?.effectiveTags).toEqual(['smoke'])
  })
})

describe('unreadable tag expressions', () => {
  it('counts an unreadable tag on a describe, which reports no declaration of its own', () => {
    expect(
      extracted("test.describe('g', { tag: [...COMMON] }, () => { test('x', async () => {}) })")
        .unreadableTagExpressions,
    ).toBe(1)
  })

  it('counts test-level and describe-level entries exactly once each', () => {
    expect(
      extracted(
        [
          "test.describe('g', { tag: [...A] }, () => {",
          "  test('x', { tag: [...B] }, async () => {})",
          '})',
        ].join('\n'),
      ).unreadableTagExpressions,
    ).toBe(2)
  })
})
