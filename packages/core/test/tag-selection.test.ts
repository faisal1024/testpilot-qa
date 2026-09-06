import { describe, expect, it } from 'vitest'
import {
  TagSelectionError,
  buildTagSelection,
  describeTagSelection,
  expandSuites,
  findConflictingGrep,
  grepValue,
  includePattern,
  isEmptySuite,
  parseTagToken,
  selectionInputFor,
  splitTagList,
  suiteTokens,
  tagPattern,
  tagSelectionArgs,
  unknownSuiteTags,
  unknownSuiteTagsDetailed,
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
    expect(a).toEqual({ include: ['smoke', 'regression'], all: [], exclude: [] })
  })

  it('routes negated tags to exclude', () => {
    expect(buildTagSelection({ tag: ['smoke', '!slow'] })).toEqual({
      include: ['smoke'],
      all: [],
      exclude: ['slow'],
    })
  })

  it('merges --exclude-tag with negated --tag', () => {
    expect(buildTagSelection({ tag: ['!a'], excludeTag: ['b'] })).toEqual({
      include: [],
      all: [],
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

  it.each(['', ' ', ',', ' , '])(
    'rejects an empty flag value %j rather than running every test',
    (value) => {
      // The likeliest real invocation: `--tag "$SUITE_TAGS"` with the variable unset.
      expect(() => buildTagSelection({ tag: [value] })).toThrow(/would run every test/)
      expect(() => buildTagSelection({ excludeTag: [value] })).toThrow(/would run every test/)
    },
  )

  it('still allows omitting the flags entirely', () => {
    expect(buildTagSelection({})).toEqual({ include: [], all: [], exclude: [] })
  })
})

describe('tagPattern / grepValue', () => {
  const matches = (names: string[], title: string) =>
    forceRegExp(grepValue(tagPattern(names))).test(title)

  it('matches a whole tag', () => {
    expect(matches(['smoke'], grepTitle('checkout works', '@smoke'))).toBe(true)
    expect(matches(['smoke'], '@smoke at the start')).toBe(true)
    expect(matches(['smoke'], 'chromium \u203a a.spec.ts \u203a group @smoke \u203a case')).toBe(
      true,
    )
  })

  it('is case-sensitive', () => {
    // Playwright compiles a BARE --grep string with `gi`. Real suites carry
    // both @here and @HERE (mattermost), so a case-insensitive match would run
    // a different set than `tags` counts and `doctor` validates.
    expect(matches(['here'], 'x @here')).toBe(true)
    expect(matches(['here'], 'x @HERE')).toBe(false)
    expect(matches(['channel'], 'x @channEL')).toBe(false)
  })

  it('emits the slash-delimited form so no implicit flags are applied', () => {
    const value = grepValue(tagPattern(['smoke']))
    expect(value.startsWith('/')).toBe(true)
    expect(value.endsWith('/')).toBe(true)
    expect(forceRegExp(value).flags).toBe('')
  })

  it('survives the wrapper when a tag contains a slash', () => {
    expect(matches(['a/b'], 'x @a/b')).toBe(true)
    expect(matches(['a/b'], 'x @a-b')).toBe(false)
  })

  it('does not match a longer tag with the same prefix', () => {
    // The failure hand-written --grep invites: `--grep @smoke` runs @smoketest too.
    expect(matches(['smoke'], 'a @smoketest')).toBe(false)
    expect(matches(['smoke'], 'a @smoke-slow')).toBe(false)
    expect(matches(['team'], 'a @team:auth')).toBe(false)
    expect(matches(['P1'], 'a @P1.2')).toBe(false)
  })

  it('does not match an @ inside a word', () => {
    // Deliberately stricter than Playwright: it would call @smoke.example a tag.
    expect(matches(['smoke'], 'notifies user@smoke.example')).toBe(false)
    expect(matches(['smoke.example'], 'notifies user@smoke.example')).toBe(false)
  })

  it('matches a tag supplied through the details argument', () => {
    // Playwright appends `{ tag: [...] }` entries to the grep title, space-separated.
    expect(matches(['smoke'], grepTitle('billing', 'checkout works', '@smoke'))).toBe(true)
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
    expect(tagSelectionArgs({ include: [], all: [], exclude: [] })).toEqual([])
  })

  it('emits --grep for includes and --grep-invert for excludes', () => {
    const args = tagSelectionArgs({ include: ['smoke'], all: [], exclude: ['slow'] })
    expect(args[0]).toBe('--grep')
    expect(args[2]).toBe('--grep-invert')
    expect(forceRegExp(args[1] as string).test('x @smoke')).toBe(true)
    expect(forceRegExp(args[3] as string).test('x @slow')).toBe(true)
    // Both sides must be case-sensitive, not just the include side.
    expect(forceRegExp(args[1] as string).test('x @SMOKE')).toBe(false)
    expect(forceRegExp(args[3] as string).test('x @SLOW')).toBe(false)
  })
})

describe('all-of selection', () => {
  const matchesArgs = (selection: Parameters<typeof tagSelectionArgs>[0], title: string) => {
    const args = tagSelectionArgs(selection)
    const grep = args[args.indexOf('--grep') + 1]
    return forceRegExp(grep as string).test(title)
  }

  it('requires every all-of tag', () => {
    const selection = { include: [], all: ['regression', 'critical'], exclude: [] }
    expect(matchesArgs(selection, grepTitle('x', '@regression', '@critical'))).toBe(true)
    expect(matchesArgs(selection, grepTitle('x', '@critical', '@regression'))).toBe(true)
    expect(matchesArgs(selection, grepTitle('x', '@regression'))).toBe(false)
    expect(matchesArgs(selection, grepTitle('x', '@critical'))).toBe(false)
  })

  it('keeps whole-tag boundaries inside the lookaheads', () => {
    const selection = { include: [], all: ['smoke'], exclude: [] }
    expect(matchesArgs(selection, 'x @smoketest')).toBe(false)
    expect(matchesArgs(selection, 'x @SMOKE')).toBe(false)
  })

  it('combines any-of with all-of', () => {
    const selection = { include: ['ui', 'api'], all: ['regression'], exclude: [] }
    expect(matchesArgs(selection, grepTitle('x', '@ui', '@regression'))).toBe(true)
    expect(matchesArgs(selection, grepTitle('x', '@api', '@regression'))).toBe(true)
    expect(matchesArgs(selection, grepTitle('x', '@ui'))).toBe(false)
    expect(matchesArgs(selection, grepTitle('x', '@db', '@regression'))).toBe(false)
  })

  it('uses the plain alternation when there is no all-of half', () => {
    expect(includePattern({ include: ['a'], all: [], exclude: [] })).toBe(tagPattern(['a']))
    expect(includePattern({ include: [], all: [], exclude: ['x'] })).toBeNull()
  })

  it('treats a negated token inside `all` as an exclusion', () => {
    expect(buildTagSelection({ allTag: ['regression', '!flaky'] })).toEqual({
      include: [],
      all: ['regression'],
      exclude: ['flaky'],
    })
  })

  it('rejects a tag that is both required and excluded', () => {
    expect(() => buildTagSelection({ allTag: ['a'], excludeTag: ['a'] })).toThrow(/both included/)
  })
})

describe('suite object form', () => {
  it('normalizes the array form to any-of', () => {
    expect(suiteTokens(['a', '!b'])).toEqual({ any: ['a', '!b'], all: [], none: [] })
  })

  it('reads any/all/none', () => {
    expect(suiteTokens({ any: ['a'], all: ['b'], none: ['c'] })).toEqual({
      any: ['a'],
      all: ['b'],
      none: ['c'],
    })
  })

  it('treats a partially-specified object as empty where unset', () => {
    expect(suiteTokens({ all: ['b'] })).toEqual({ any: [], all: ['b'], none: [] })
  })

  it('detects an empty suite in either form', () => {
    expect(isEmptySuite([])).toBe(true)
    expect(isEmptySuite({})).toBe(true)
    expect(isEmptySuite({ any: [], all: [], none: [] })).toBe(true)
    expect(isEmptySuite({ all: ['a'] })).toBe(false)
  })

  it('expands an object suite through --suite', () => {
    const selection = buildTagSelection(
      selectionInputFor({
        suites: { nightly: { all: ['regression', 'critical'], none: ['flaky'] } },
        suite: ['nightly'],
      }),
    )
    expect(selection).toEqual({
      include: [],
      all: ['regression', 'critical'],
      exclude: ['flaky'],
    })
  })

  it('unions includes across --suite and --tag rather than intersecting', () => {
    // Documented in CLI-Spec 3.1a; an intersection is expressed with `all`.
    const selection = buildTagSelection(
      selectionInputFor({
        suites: { nightly: ['regression'] },
        suite: ['nightly'],
        tag: ['smoke'],
      }),
    )
    expect(selection.include).toEqual(['regression', 'smoke'])
  })
})

describe('describeTagSelection', () => {
  it('reads as prose', () => {
    expect(describeTagSelection({ include: ['a', 'b'], all: [], exclude: ['c'] })).toBe(
      'any of @a, @b, excluding @c',
    )
    expect(describeTagSelection({ include: [], all: ['a', 'b'], exclude: [] })).toBe(
      'all of @a, @b',
    )
    expect(describeTagSelection({ include: [], all: [], exclude: ['c'] })).toBe(
      'all tests, excluding @c',
    )
  })
})

describe('findConflictingGrep', () => {
  // Playwright 1.63's complete short-option set (from its program.js):
  // -c config, -g grep, -G grep-invert, -u update-snapshots [optional],
  // -j workers, -x fail-fast. Our args are prepended, so an alias we miss means
  // Playwright keeps the user's flag and silently drops ours.
  it.each([['--grep'], ['--grep-invert']])('detects %s', (flag) => {
    expect(findConflictingGrep(['--headed', flag, 'x'])).toBe(flag)
  })

  it('detects the --flag=value form', () => {
    expect(findConflictingGrep(['--grep=foo'])).toBe('--grep')
    expect(findConflictingGrep(['--grep-invert=foo'])).toBe('--grep-invert')
  })

  it.each([
    ['-g', '-g'],
    ['-G', '-G'],
    ['-g@smoke', '-g'],
    ['-G@flaky', '-G'],
    // commander parses a cluster left to right: -x is boolean, so -g follows.
    ['-xg', '-g'],
    ['-xG', '-G'],
    ['-xg@regression', '-g'],
  ])('detects %s as %s', (arg, expected) => {
    expect(findConflictingGrep([arg, '@foo'])).toBe(expected)
  })

  it('does not refuse an unrelated flag whose value happens to contain a g', () => {
    // -u takes an optional value, so `-uchanged` is --update-snapshots=changed.
    // A "cluster contains a g" heuristic refused these.
    expect(findConflictingGrep(['-uchanged'])).toBeNull()
    expect(findConflictingGrep(['-umissing'])).toBeNull()
    expect(findConflictingGrep(['-xuchanged'])).toBeNull()
    expect(findConflictingGrep(['-cplaywright.config.ts'])).toBeNull()
    expect(findConflictingGrep(['-j2'])).toBeNull()
  })

  it('ignores unrelated args', () => {
    expect(findConflictingGrep(['--headed', '--workers=2', 'a.spec.ts'])).toBeNull()
    expect(findConflictingGrep(['--global-timeout=1000'])).toBeNull()
    expect(findConflictingGrep(['-x'])).toBeNull()
  })
})

describe('expandSuites', () => {
  const suites = { nightly: ['regression', '!flaky'], smoke: ['smoke'] }

  it('expands to raw tokens', () => {
    expect(expandSuites(suites, ['nightly'])).toEqual({
      any: ['regression', '!flaky'],
      all: [],
      none: [],
    })
  })

  it('errors on an unknown suite and lists the real ones', () => {
    expect(() => expandSuites(suites, ['nighlty'])).toThrow(/Available suites: nightly, smoke/)
  })

  it('points at a case-only mismatch', () => {
    expect(() => expandSuites(suites, ['Nightly'])).toThrow(/Did you mean "nightly"/)
  })

  it('errors on an empty suite rather than selecting everything', () => {
    expect(() => expandSuites({ everything: [] }, ['everything'])).toThrow(
      /would select every test/,
    )
  })

  it.each([[''], [' '], [',']])('rejects an empty --suite value %j', (value) => {
    expect(() => expandSuites(suites, [value])).toThrow(/would run every test/)
  })

  it('refuses more than one suite rather than folding them', () => {
    expect(() => expandSuites(suites, ['nightly', 'smoke'])).toThrow(/Only one --suite/)
    expect(() => expandSuites(suites, ['nightly,smoke'])).toThrow(/Only one --suite/)
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
    expect(selection).toEqual({ include: ['regression'], all: [], exclude: ['flaky', 'slow'] })
  })
})

describe('validateSuites', () => {
  it('passes a well-formed map', () => {
    expect(validateSuites({ nightly: ['regression', '!flaky'] })).toEqual([])
  })

  it('flags an empty suite', () => {
    expect(validateSuites({ everything: [] })[0]?.message).toMatch(/would run every test/)
  })

  it('flags an unusable suite name', () => {
    expect(validateSuites({ 'a b': ['x'] })[0]).toMatchObject({
      severity: 'warn',
      message: expect.stringMatching(/needs quoting/),
    })
  })

  it('flags a malformed tag token', () => {
    expect(validateSuites({ nightly: ['has space'] })[0]?.message).toMatch(/not a valid tag name/)
  })

  it('flags a self-contradicting suite', () => {
    expect(validateSuites({ nightly: ['a', '!a'] })[0]?.message).toMatch(/both included/)
  })
})

describe('unknownSuiteTags', () => {
  it('reports include-side tags no test carries', () => {
    expect(unknownSuiteTags(['regresion', '!flaky'], new Set(['regression', 'flaky']))).toEqual([
      'regresion',
    ])
  })

  it('does not treat a missing EXCLUDE tag as changing the selection', () => {
    // `nightly: ['regression', '!flaky']` before anyone tags @flaky: excluding
    // a tag nobody carries cannot change what runs, so it must not be reported
    // as "would not select what you expect", nor suppress the count.
    const vocabulary = new Set(['regression'])
    expect(unknownSuiteTags(['regression', '!flaky'], vocabulary)).toEqual([])
    expect(unknownSuiteTagsDetailed(['regression', '!flaky'], vocabulary)).toEqual({
      include: [],
      exclude: ['flaky'],
    })
  })

  it('separates the two sides', () => {
    expect(unknownSuiteTagsDetailed(['a', '!b'], new Set())).toEqual({
      include: ['a'],
      exclude: ['b'],
    })
  })

  it('reports nothing when every tag exists', () => {
    expect(unknownSuiteTags(['a', '!b'], new Set(['a', 'b']))).toEqual([])
  })

  it('defers malformed tokens to validateSuites rather than double-reporting', () => {
    expect(unknownSuiteTags(['has space'], new Set())).toEqual([])
  })
})

/**
 * Playwright's own `forceRegExp` (packages/playwright/src/util.ts), copied so
 * these tests assert what Playwright will actually do with our `--grep` value.
 *
 * The `gi` fallback is the whole point: asserting with a bare `new RegExp`
 * silently claims a case-sensitivity Playwright does not give a plain string.
 */
function forceRegExp(pattern: string): RegExp {
  const match = pattern.match(/^\/(.*)\/([gi]*)$/)
  if (match) {
    return new RegExp(match[1] as string, match[2])
  }
  return new RegExp(pattern, 'gi')
}

/** How Playwright builds the string it greps: titles then details-argument tags. */
function grepTitle(...parts: string[]): string {
  return parts.join(' ')
}
