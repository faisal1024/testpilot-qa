/**
 * Compiles tag selections into Playwright's own `--grep` / `--grep-invert` flags.
 *
 * TestPilot adds no selection semantics of its own: `--tag smoke` is exactly
 * `--grep "(?<!\S)@smoke(?!\S)"`. Keeping the compilation visible (and printed
 * in `--verbose`) is what keeps generated projects ejectable — a team can drop
 * TestPilot and paste the flags into their own CI.
 *
 * The boundary assertions are Playwright's own tag tokenization. Playwright
 * finds title tags with `/@\S+/`, and appends `{ tag: [...] }` entries to the
 * title space-separated, so a tag is exactly a whitespace-delimited run
 * starting at `@`. Asserting the same boundary means `--tag team` does not
 * match `@team:auth` and `--tag smoke` does not match `@smoketest` — the
 * silent "ran the wrong subset" failure that hand-written `--grep` invites.
 */

/** A tag name without its leading `@` (e.g. `smoke`). */
export type TagName = string

export interface TagSelection {
  /** Tags to run — any-of. Empty means "no include filter". */
  include: TagName[]
  /** Tags to skip — none-of. Applied after {@link include}. */
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

export interface BuildTagSelectionInput {
  /** Raw `--tag` values. Each may be a comma-separated list; `!x` negates. */
  tag?: string[]
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
  const exclude: TagName[] = []

  for (const raw of input.tag ?? []) {
    for (const token of splitTagList(raw)) {
      const { name, negated } = parseTagToken(token)
      ;(negated ? exclude : include).push(name)
    }
  }
  for (const raw of input.excludeTag ?? []) {
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
  const excludes = dedupe(exclude)
  const contradictions = includes.filter((name) => excludes.includes(name))
  if (contradictions.length > 0) {
    throw new TagSelectionError(
      `Tag${contradictions.length > 1 ? 's' : ''} ${contradictions
        .map((name) => `"${name}"`)
        .join(
          ', ',
        )} ${contradictions.length > 1 ? 'are' : 'is'} both included and excluded, which selects no tests. Remove one side.`,
    )
  }

  return { include: includes, exclude: excludes }
}

/** True when the selection filters nothing (so `run` stays a pure pass-through). */
export function isEmptySelection(selection: TagSelection): boolean {
  return selection.include.length === 0 && selection.exclude.length === 0
}

/**
 * Builds the RegExp source matching any of `names` as a whole tag.
 *
 * Alternation is wrapped so the boundary assertions apply to every branch.
 */
export function tagPattern(names: TagName[]): string {
  const bodies = names.map((name) => escapeForRegExp(name)).join('|')
  const group = names.length === 1 ? bodies : `(?:${bodies})`
  return `(?<!\\S)@${group}(?!\\S)`
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
  if (selection.include.length > 0) {
    args.push('--grep', tagPattern(selection.include))
  }
  if (selection.exclude.length > 0) {
    args.push('--grep-invert', tagPattern(selection.exclude))
  }
  return args
}

/** Human-readable summary, e.g. `smoke or regression, excluding slow`. */
export function describeTagSelection(selection: TagSelection): string {
  const parts: string[] = []
  if (selection.include.length > 0) {
    parts.push(selection.include.map((name) => `@${name}`).join(' or '))
  } else {
    parts.push('all tests')
  }
  if (selection.exclude.length > 0) {
    parts.push(`excluding ${selection.exclude.map((name) => `@${name}`).join(' and ')}`)
  }
  return parts.join(', ')
}

const GREP_FLAGS = new Set(['--grep', '-g', '--grep-invert'])

/**
 * Finds a caller-supplied grep flag among forwarded args.
 *
 * Playwright takes the last occurrence of a repeated flag, so appending ours
 * after theirs would silently discard the user's filter (or vice versa). We
 * refuse instead.
 */
export function findConflictingGrep(forwardedArgs: string[]): string | null {
  for (const arg of forwardedArgs) {
    if (GREP_FLAGS.has(arg)) {
      return arg
    }
    const eq = arg.indexOf('=')
    if (eq > 0 && GREP_FLAGS.has(arg.slice(0, eq))) {
      return arg.slice(0, eq)
    }
  }
  return null
}
