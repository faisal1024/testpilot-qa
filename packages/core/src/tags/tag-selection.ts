/**
 * Compiles tag selections into Playwright's own `--grep` / `--grep-invert` flags.
 *
 * TestPilot adds no selection semantics of its own: `--tag smoke` is exactly
 * `--grep "(?<!\S)@smoke(?!\S)"`. Keeping the compilation visible (and printed
 * in `--verbose`) is what keeps generated projects ejectable — a team can drop
 * TestPilot and paste the flags into their own CI.
 *
 * Two details of Playwright's matching drive the compiled shape, both verified
 * against its source rather than assumed:
 *
 * 1. **Case.** `forceRegExp` compiles a bare `--grep` string as
 *    `new RegExp(pattern, 'gi')` — case-**insensitive**. A slash-delimited
 *    value (`/…/`) is taken as an explicit regex with only the flags written
 *    after it, so we emit that form to get case-sensitive matching. Without it
 *    `--tag here` also runs `@HERE`, which real suites do have (mattermost
 *    carries `@here`, `@HERE` and `@channEL` as distinct tags), and `run` would
 *    then select a different set than `tags` counts and `doctor` validates.
 * 2. **Boundaries.** Playwright greps against
 *    `[...ancestorTitlesAndTags, ownTitle, ...ownTags].join(' ')`, and reads
 *    title tags with `/@\S+/`. We assert a whitespace boundary on both sides,
 *    which is **deliberately stricter than Playwright on the leading side**: in
 *    `user@smoke.example` Playwright would call `@smoke.example` a tag, and we
 *    will not select it. That is the intended trade — it is what stops
 *    `--tag smoke` running `@smoketest` and `--tag team` running `@team:auth`,
 *    the silent "ran the wrong subset" failure hand-written `--grep` invites.
 *    `tags` reports which tags are unselectable for this reason.
 */

/** A tag name without its leading `@` (e.g. `smoke`). */
export type TagName = string

export interface TagSelection {
  /** Tags to run — **any**-of. Empty means "no any-of filter". */
  include: TagName[]
  /** Tags a test must carry **all** of. Empty means "no all-of filter". */
  all: TagName[]
  /** Tags to skip — none-of. Applied after {@link include} and {@link all}. */
  exclude: TagName[]
}

export class TagSelectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TagSelectionError'
  }
}

/**
 * A tag body must be a non-empty run of non-whitespace with no `@` (which would
 * start a second tag) and no leading `-`/`!` (which read as negation). This is
 * deliberately narrower than Playwright's `@\S+`: an exotic tag can still be
 * selected with a hand-written `--grep` after `--`.
 */
const TAG_BODY = /^[A-Za-z0-9_][^\s@]*$/

const REGEX_METACHARS = /[.*+?^${}()|[\]\\/]/g

/** Escapes a validated tag body for embedding in a RegExp source. */
export function escapeForRegExp(value: string): string {
  return value.replace(REGEX_METACHARS, '\\$&')
}

/**
 * Normalizes one user-written tag token.
 *
 * Accepts `smoke`, `@smoke`, `!smoke`, `!@smoke`, `-smoke`. Returns the bare
 * name plus whether it was negated.
 */
export function parseTagToken(raw: string): { name: TagName; negated: boolean } {
  const token = raw.trim()
  if (token === '') {
    throw new TagSelectionError('Empty tag. Write a tag name, e.g. `--tag smoke`.')
  }
  let rest = token
  let negated = false
  if (rest.startsWith('!') || rest.startsWith('-')) {
    negated = true
    rest = rest.slice(1)
  }
  if (rest.startsWith('@')) {
    rest = rest.slice(1)
  }
  if (rest === '') {
    throw new TagSelectionError(
      `Tag "${token}" has no name. Write a tag name, e.g. \`--tag '!slow'\`.`,
    )
  }
  if (!TAG_BODY.test(rest)) {
    throw new TagSelectionError(
      `Tag "${token}" is not a valid tag name. Tags must start with a letter, digit or "_" and contain no whitespace or "@". For anything more exotic, pass a regex to Playwright directly: \`testpilot run -- --grep '<pattern>'\`.`,
    )
  }
  return { name: rest, negated }
}

/**
 * Splits a comma-separated tag list into tokens.
 * `--tag smoke,regression` and `--tag smoke --tag regression` are the same.
 *
 * Commas only, deliberately. Splitting on whitespace too would turn a config
 * entry of `'has space'` into two tags that happen to be valid, quietly running
 * a different set. A malformed token has to fail loudly instead.
 */
export function splitTagList(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)]
}

/**
 * Rejects a flag value that contains no tag at all.
 *
 * `--tag ''`, `--tag ' '` and `--tag ','` are almost always an unset or
 * misspelled CI variable. Treating them as "no filter" runs the entire suite
 * and exits `0` — the exact silent-wrong-set failure this feature removes.
 */
function assertNotEmpty(raw: string, flag: string): void {
  if (splitTagList(raw).length === 0) {
    throw new TagSelectionError(
      `${flag} was given an empty value, which would run every test. Write a tag name (e.g. \`${flag} smoke\`), or drop the flag.`,
    )
  }
}

export interface BuildTagSelectionInput {
  /** Raw `--tag` values. Each may be a comma-separated list; `!x` negates. */
  tag?: string[]
  /** Raw all-of values (from a suite's `all`). A test must carry every one. */
  allTag?: string[]
  /** Raw `--exclude-tag` values. Each may be a comma-separated list. */
  excludeTag?: string[]
}

/**
 * Builds a {@link TagSelection} from raw CLI values.
 *
 * A tag that appears on both sides is an error rather than a silent
 * empty-set run — the same principle as Phase 9's discovery: never produce a
 * confident result over a set the user did not mean.
 */
export function buildTagSelection(input: BuildTagSelectionInput): TagSelection {
  const include: TagName[] = []
  const all: TagName[] = []
  const exclude: TagName[] = []

  for (const raw of input.allTag ?? []) {
    assertNotEmpty(raw, 'all')
    for (const token of splitTagList(raw)) {
      const { name, negated } = parseTagToken(token)
      ;(negated ? exclude : all).push(name)
    }
  }
  for (const raw of input.tag ?? []) {
    // `--tag ''` (an unset CI variable) must not degrade to running everything.
    // `parseTagToken` has the right message but `splitTagList` drops the empty
    // token before it can be reached, so the check belongs here.
    assertNotEmpty(raw, '--tag')
    for (const token of splitTagList(raw)) {
      const { name, negated } = parseTagToken(token)
      ;(negated ? exclude : include).push(name)
    }
  }
  for (const raw of input.excludeTag ?? []) {
    assertNotEmpty(raw, '--exclude-tag')
    for (const token of splitTagList(raw)) {
      const { name, negated } = parseTagToken(token)
      if (negated) {
        throw new TagSelectionError(
          `--exclude-tag ${token} is a double negative. Write \`--exclude-tag ${name}\` or \`--tag '!${name}'\`.`,
        )
      }
      exclude.push(name)
    }
  }

  const includes = dedupe(include)
  const alls = dedupe(all)
  const excludes = dedupe(exclude)
  const contradictions = [...includes, ...alls].filter((name) => excludes.includes(name))
  if (contradictions.length > 0) {
    throw new TagSelectionError(
      `Tag${contradictions.length > 1 ? 's' : ''} ${contradictions
        .map((name) => `"${name}"`)
        .join(
          ', ',
        )} ${contradictions.length > 1 ? 'are' : 'is'} both included and excluded, which selects no tests. Remove one side.`,
    )
  }

  return { include: includes, all: alls, exclude: excludes }
}

/** True when the selection filters nothing (so `run` stays a pure pass-through). */
export function isEmptySelection(selection: TagSelection): boolean {
  return (
    selection.include.length === 0 && selection.all.length === 0 && selection.exclude.length === 0
  )
}

/**
 * Builds the RegExp source matching any of `names` as a whole tag.
 *
 * Alternation is wrapped so the boundary assertions apply to every branch.
 * This is the bare source; {@link grepValue} wraps it for Playwright's CLI.
 */
export function tagPattern(names: TagName[]): string {
  const bodies = names.map((name) => escapeForRegExp(name)).join('|')
  const group = names.length === 1 ? bodies : `(?:${bodies})`
  return `(?<!\\S)@${group}(?!\\S)`
}

/**
 * Wraps a pattern in the slash-delimited form Playwright reads as an explicit
 * regex with no implicit flags.
 *
 * A bare string would be compiled `gi`, making every tag match
 * case-insensitively. `escapeForRegExp` already escapes `/`, and the pattern
 * always ends with `(?!\S)`, so the delimiters can never be mis-parsed.
 */
export function grepValue(pattern: string): string {
  return `/${pattern}/`
}

/**
 * The positive half of a selection, as one RegExp source.
 *
 * Any-of is a plain alternation. All-of needs one lookahead per tag, because a
 * single regex has to assert several independent substrings — the idiom
 * Playwright's own docs use for `--grep`. `[\s\S]` rather than `.` so a
 * multi-line title cannot defeat it.
 */
export function includePattern(selection: TagSelection): string | null {
  if (selection.all.length === 0) {
    return selection.include.length > 0 ? tagPattern(selection.include) : null
  }
  const parts = selection.all.map((name) => `(?=[\\s\\S]*${tagPattern([name])})`)
  if (selection.include.length > 0) {
    parts.unshift(`(?=[\\s\\S]*${tagPattern(selection.include)})`)
  }
  return parts.join('')
}

/**
 * Compiles a selection into Playwright flags.
 *
 * Playwright applies `--grep` and `--grep-invert` independently, so any-of
 * include plus none-of exclude needs exactly one of each — the two-flag shape
 * people most often get wrong by hand.
 */
export function tagSelectionArgs(selection: TagSelection): string[] {
  const args: string[] = []
  const include = includePattern(selection)
  if (include) {
    args.push('--grep', grepValue(include))
  }
  if (selection.exclude.length > 0) {
    args.push('--grep-invert', grepValue(tagPattern(selection.exclude)))
  }
  return args
}

/** Human-readable summary, e.g. `smoke or regression, excluding slow`. */
export function describeTagSelection(selection: TagSelection): string {
  const parts: string[] = []
  if (selection.include.length > 0) {
    parts.push(selection.include.map((name) => `@${name}`).join(' or '))
  }
  if (selection.all.length > 0) {
    parts.push(selection.all.map((name) => `@${name}`).join(' and '))
  }
  if (parts.length === 0) {
    parts.push('all tests')
  }
  if (selection.exclude.length > 0) {
    parts.push(`excluding ${selection.exclude.map((name) => `@${name}`).join(' and ')}`)
  }
  return parts.join(', ')
}

/**
 * Every spelling Playwright accepts for a grep flag.
 *
 * `-G` is the `--grep-invert` alias on 1.61+, `-gv` on 1.42–~1.53, and some
 * versions in between have none. All are listed because our args are prepended:
 * an alias we fail to recognize means Playwright keeps the user's later flag and
 * silently drops ours, so the excluded tests run.
 */
const GREP_LONG_FLAGS = new Set(['--grep', '--grep-invert'])
const GREP_SHORT_FLAGS = ['-gv', '-G', '-g']

/**
 * Finds a caller-supplied grep flag among forwarded args.
 *
 * Playwright takes the last occurrence of a repeated flag, so appending ours
 * after theirs would silently discard one of the two filters. We refuse instead.
 */
export function findConflictingGrep(forwardedArgs: string[]): string | null {
  for (const arg of forwardedArgs) {
    if (GREP_LONG_FLAGS.has(arg)) {
      return arg
    }
    const eq = arg.indexOf('=')
    if (eq > 0 && GREP_LONG_FLAGS.has(arg.slice(0, eq))) {
      return arg.slice(0, eq)
    }
    // Short flags may carry an attached value (`-g@smoke`), so match by prefix.
    // Longest first, or `-gv@x` would report `-g`.
    const short = GREP_SHORT_FLAGS.find((flag) => arg === flag || arg.startsWith(flag))
    if (short) {
      return short
    }
  }
  return null
}
