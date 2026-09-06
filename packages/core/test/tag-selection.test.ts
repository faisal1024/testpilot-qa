import { describe, expect, it } from 'vitest'
import {
  TagSelectionError,
  buildTagSelection,
  describeTagSelection,
  expandSuites,
  findConflictingGrep,
  parseTagToken,
  selectionInputFor,
  splitTagList,
  tagPattern,
  tagSelectionArgs,
  unknownSuiteTags,
  validateSuites,
} from '../src/index.js'

describe('parseTagToken', () => {
  it.each([
    ['smoke', { name: 'smoke', negated: false }],
    ['@smoke', { name: 'smoke', negated: false }],
    ['!smoke', { name: 'smoke', negated: true }],
    ['!@smoke', { name: 'smoke', negated: true }],
    ['-smoke', { name: 'smoke', negated: true }],
    ['  @smoke  ', { name: 'smoke', negated: false }],
    ['team:auth', { name: 'team:auth', negated: false }],
    ['P1.2', { name: 'P1.2', negated: false }],
  ])('parses %s', (input, expected) => {
    expect(parseTagToken(input)).toEqual(expected)
  })

  it.each(['', '@', '!', '!@', 'has space', 'a@b', '.leading'])('rejects %j', (input) => {
    expect(() => parseTagToken(input)).toThrow(TagSelectionError)
  })

  it('names the escape hatch when a tag is unusable', () => {
    expect(() => parseTagToken('weird tag')).toThrow(/--grep/)
  })
})

describe('splitTagList', () => {
  it('splits on commas and drops empties', () => {
    expect(splitTagList('smoke, regression ,,  slow')).toEqual(['smoke', 'regression', 'slow'])
  })

  it('does not split on whitespace, so a malformed entry fails loudly', () => {
    expect(splitTagList('has space')).toEqual(['has space'])
    expect(() => buildTagSelection({ tag: ['has space'] })).toThrow(/not a valid tag name/)
  })
})

describe('buildTagSelection', () => {
  it('treats repeated flags and comma lists identically', () => {
    const a = buildTagSelection({ tag: ['smoke,regression'] })
    const b = buildTagSelection({ tag: ['smoke', 'regression'] })
    expect(a).toEqual(b)
    expect(a).toEqual({ include: ['smoke', 'regression'], exclude: [] })
  })

  it('routes negated tags to exclude', () => {
    expect(buildTagSelection({ tag: ['smoke', '!slow'] })).toEqual({
      include: ['smoke'],
      exclude: ['slow'],
    })
  })

  it('merges --exclude-tag with negated --tag', () => {
    expect(buildTagSelection({ tag: ['!a'], excludeTag: ['b'] })).toEqual({
      include: [],
      exclude: ['a', 'b'],
    })
  })

  it('dedupes', () => {
    expect(buildTagSelection({ tag: ['smoke', '@smoke'] }).include).toEqual(['smoke'])
  })

  it('rejects a tag that is both included and excluded', () => {
    // Silently selecting nothing is the failure this feature exists to remove.
    expect(() => buildTagSelection({ tag: ['smoke', '!smoke'] })).toThrow(/both included/)
  })

  it('rejects a double negative on --exclude-tag', () => {
    expect(() => buildTagSelection({ excludeTag: ['!slow'] })).toThrow(/double negative/)
  })
})

describe('tagPattern', () => {
  const matches = (names: string[], title: string) => new RegExp(tagPattern(names)).test(title)

  it('matches a whole tag', () => {
    expect(matches(['smoke'], 'checkout works @smoke')).toBe(true)
    expect(matches(['smoke'], '@smoke at the start')).toBe(true)
    expect(matches(['smoke'], 'chromium › a.spec.ts › group @smoke › case')).toBe(true)
  })

  it('does not match a longer tag with the same prefix', () => {
    // The failure hand-written --grep invites: `--grep @smoke` runs @smoketest too.
    expect(matches(['smoke'], 'a @smoketest')).toBe(false)
    expect(matches(['smoke'], 'a @smoke-slow')).toBe(false)
    expect(matches(['team'], 'a @team:auth')).toBe(false)
    expect(matches(['P1'], 'a @P1.2')).toBe(false)
  })

  it('does not match an @ inside a word', () => {
    expect(matches(['smoke'], 'notifies user@smoke.example')).toBe(false)
  })

  it('escapes regex metacharacters in the tag body', () => {
    expect(matches(['P1.2'], 'a @P1.2')).toBe(true)
    expect(matches(['P1.2'], 'a @P1x2')).toBe(false)
  })

  it('applies the boundaries to every alternative', () => {
    expect(matches(['smoke', 'regression'], 'a @regressiontest')).toBe(false)
    expect(matches(['smoke', 'regression'], 'a @regression')).toBe(true)
  })
})

describe('tagSelectionArgs', () => {
  it('emits nothing for an empty selection', () => {
    expect(tagSelectionArgs({ include: [], exclude: [] })).toEqual([])
  })

  it('emits --grep for includes and --grep-invert for excludes', () => {
    const args = tagSelectionArgs({ include: ['smoke'], exclude: ['slow'] })
    expect(args[0]).toBe('--grep')
    expect(args[2]).toBe('--grep-invert')
    expect(new RegExp(args[1] as string).test('x @smoke')).toBe(true)
    expect(new RegExp(args[3] as string).test('x @slow')).toBe(true)
  })
})

describe('describeTagSelection', () => {
  it('reads as prose', () => {
    expect(describeTagSelection({ include: ['a', 'b'], exclude: ['c'] })).toBe(
      '@a or @b, excluding @c',
    )
    expect(describeTagSelection({ include: [], exclude: ['c'] })).toBe('all tests, excluding @c')
  })
})

describe('findConflictingGrep', () => {
  it.each([['--grep'], ['-g'], ['--grep-invert']])('detects %s', (flag) => {
    expect(findConflictingGrep(['--headed', flag, 'x'])).toBe(flag)
  })

  it('detects the --flag=value form', () => {
    expect(findConflictingGrep(['--grep=foo'])).toBe('--grep')
  })

  it('ignores unrelated args', () => {
    expect(findConflictingGrep(['--headed', '--workers=2', 'a.spec.ts'])).toBeNull()
  })
})

describe('expandSuites', () => {
  const suites = { nightly: ['regression', '!flaky'], smoke: ['smoke'] }

  it('expands to raw tokens', () => {
    expect(expandSuites(suites, ['nightly'])).toEqual(['regression', '!flaky'])
  })

  it('errors on an unknown suite and lists the real ones', () => {
    expect(() => expandSuites(suites, ['nighlty'])).toThrow(/Available suites: nightly, smoke/)
  })

  it('points at a case-only mismatch', () => {
    expect(() => expandSuites(suites, ['Nightly'])).toThrow(/Did you mean "nightly"/)
  })

  it('errors on an empty suite rather than selecting everything', () => {
    expect(() => expandSuites({ all: [] }, ['all'])).toThrow(/would select every test/)
  })

  it('says how to define suites when none exist', () => {
    expect(() => expandSuites({}, ['nightly'])).toThrow(/No suites are defined/)
  })
})

describe('selectionInputFor', () => {
  it('composes a suite with explicit tags', () => {
    const selection = buildTagSelection(
      selectionInputFor({
        suites: { nightly: ['regression', '!flaky'] },
        suite: ['nightly'],
        excludeTag: ['slow'],
      }),
    )
    expect(selection).toEqual({ include: ['regression'], exclude: ['flaky', 'slow'] })
  })
})

describe('validateSuites', () => {
  it('passes a well-formed map', () => {
    expect(validateSuites({ nightly: ['regression', '!flaky'] })).toEqual([])
  })

  it('flags an empty suite', () => {
    expect(validateSuites({ all: [] })[0]?.message).toMatch(/would run every test/)
  })

  it('flags an unusable suite name', () => {
    expect(validateSuites({ 'a b': ['x'] })[0]?.message).toMatch(/cannot be written/)
  })

  it('flags a malformed tag token', () => {
    expect(validateSuites({ nightly: ['has space'] })[0]?.message).toMatch(/not a valid tag name/)
  })

  it('flags a self-contradicting suite', () => {
    expect(validateSuites({ nightly: ['a', '!a'] })[0]?.message).toMatch(/both included/)
  })
})

describe('unknownSuiteTags', () => {
  it('reports tags no test carries, on both sides', () => {
    expect(unknownSuiteTags(['regression', '!flakey'], new Set(['regression', 'flaky']))).toEqual([
      'flakey',
    ])
  })

  it('reports nothing when every tag exists', () => {
    expect(unknownSuiteTags(['a', '!b'], new Set(['a', 'b']))).toEqual([])
  })

  it('defers malformed tokens to validateSuites rather than double-reporting', () => {
    expect(unknownSuiteTags(['has space'], new Set())).toEqual([])
  })
})
