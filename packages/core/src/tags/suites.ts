import { type BuildTagSelectionInput, TagSelectionError, splitTagList } from './tag-selection.js'

/** Named tag sets from `testpilot.config.ts`. */
export type SuiteDefinition = string[] | { any?: string[]; all?: string[]; none?: string[] }
export type SuiteMap = Record<string, SuiteDefinition>

/** The three token lists a suite contributes, whichever form it was written in. */
export interface SuiteTokens {
  any: string[]
  all: string[]
  none: string[]
}

/** Normalizes either suite form to {@link SuiteTokens}. The array form is any-of. */
export function suiteTokens(definition: SuiteDefinition): SuiteTokens {
  if (Array.isArray(definition)) {
    return { any: definition, all: [], none: [] }
  }
  return {
    any: definition.any ?? [],
    all: definition.all ?? [],
    none: definition.none ?? [],
  }
}

/** True when a suite selects nothing at all — it would run every test. */
export function isEmptySuite(definition: SuiteDefinition): boolean {
  const tokens = suiteTokens(definition)
  return tokens.any.length === 0 && tokens.all.length === 0 && tokens.none.length === 0
}

/**
 * A suite name is written on the command line, so keep it to characters that
 * survive a shell unquoted. Awkward names still work — `doctor` only warns.
 */
const SUITE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/

export function isValidSuiteName(name: string): boolean {
  return SUITE_NAME.test(name)
}

function suggest(name: string, available: string[]): string {
  if (available.length === 0) {
    return 'No suites are defined. Add a `suites` key to testpilot.config.ts, e.g. `suites: { smoke: ["smoke"] }`.'
  }
  const lower = name.toLowerCase()
  const near = available.find((candidate) => candidate.toLowerCase() === lower)
  if (near) {
    return `Did you mean "${near}"? Suite names are case-sensitive.`
  }
  return `Available suites: ${available.slice().sort().join(', ')}.`
}

/**
 * Expands `--suite` names into merged tag tokens.
 *
 * An unknown suite is an error, never an empty selection: silently running the
 * whole suite (or none of it) because of a typo is the failure this feature
 * exists to remove.
 */
export function expandSuites(suites: SuiteMap, names: string[]): SuiteTokens {
  const merged: SuiteTokens = { any: [], all: [], none: [] }
  for (const raw of names) {
    // `--suite ''` yields no token at all, so the unknown-suite guard below
    // never fires and the run silently widens to the whole suite.
    if (splitTagList(raw).length === 0) {
      throw new TagSelectionError(
        '--suite was given an empty value, which would run every test. Name a suite, or drop the flag.',
      )
    }
  }
  const requested = names.flatMap((raw) => splitTagList(raw))
  // Two suites cannot be merged into one include/exclude pair without changing
  // what either selects: `{ fast: ['!slow'], nightly: ['regression'] }` would
  // fold to "regression, excluding slow", which is neither suite — `fast`'s
  // "everything" is gone and `nightly`'s @regression @slow tests are dropped.
  // Expressing the union needs one regex per suite, which would stop the
  // compiled flags being something a team can read and paste. Refuse instead.
  if (requested.length > 1) {
    throw new TagSelectionError(
      `Only one --suite can be used at a time (got ${requested.map((name) => `"${name}"`).join(', ')}). Combining two suites would change what each one selects. Define a suite that covers both, or run them separately.`,
    )
  }
  for (const raw of names) {
    for (const name of splitTagList(raw)) {
      const entry = suites[name]
      if (!entry) {
        throw new TagSelectionError(
          `Unknown suite "${name}". ${suggest(name, Object.keys(suites))}`,
        )
      }
      if (isEmptySuite(entry)) {
        throw new TagSelectionError(
          `Suite "${name}" is empty, which would select every test. Give it at least one tag, or drop --suite.`,
        )
      }
      const tokens = suiteTokens(entry)
      merged.any.push(...tokens.any)
      merged.all.push(...tokens.all)
      merged.none.push(...tokens.none)
    }
  }
  return merged
}

/**
 * Merges a `--suite` expansion with explicit `--tag` / `--exclude-tag` values.
 *
 * The CLI refuses `--suite` together with `--tag` (both choose what to
 * include, and neither "either" nor "both" is the obvious reading), so in
 * practice at most one include source is populated here. Excludes always
 * compose: narrowing a suite is unambiguous.
 */
export function selectionInputFor(options: {
  suites: SuiteMap
  suite?: string[]
  tag?: string[]
  excludeTag?: string[]
}): BuildTagSelectionInput {
  const fromSuites = expandSuites(options.suites, options.suite ?? [])
  return {
    tag: [...fromSuites.any, ...(options.tag ?? [])],
    allTag: fromSuites.all,
    excludeTag: [...fromSuites.none, ...(options.excludeTag ?? [])],
  }
}
