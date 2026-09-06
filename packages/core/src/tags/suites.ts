import { type BuildTagSelectionInput, TagSelectionError, splitTagList } from './tag-selection.js'

/** Named tag sets from `testpilot.config.ts` — `{ nightly: ['regression', '!flaky'] }`. */
export type SuiteMap = Record<string, string[]>

/**
 * A suite name is written on the command line, so keep it to characters that
 * survive a shell unquoted.
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
 * Expands `--suite` names into raw tag tokens.
 *
 * An unknown suite is an error, never an empty selection: silently running the
 * whole suite (or none of it) because of a typo is the failure this feature
 * exists to remove.
 */
export function expandSuites(suites: SuiteMap, names: string[]): string[] {
  const tokens: string[] = []
  for (const raw of names) {
    for (const name of splitTagList(raw)) {
      const entry = suites[name]
      if (!entry) {
        throw new TagSelectionError(
          `Unknown suite "${name}". ${suggest(name, Object.keys(suites))}`,
        )
      }
      if (entry.length === 0) {
        throw new TagSelectionError(
          `Suite "${name}" is empty, which would select every test. Give it at least one tag, or drop --suite.`,
        )
      }
      tokens.push(...entry)
    }
  }
  return tokens
}

/** Merges `--suite` expansions with explicit `--tag` / `--exclude-tag` values. */
export function selectionInputFor(options: {
  suites: SuiteMap
  suite?: string[]
  tag?: string[]
  excludeTag?: string[]
}): BuildTagSelectionInput {
  const fromSuites = expandSuites(options.suites, options.suite ?? [])
  return {
    tag: [...fromSuites, ...(options.tag ?? [])],
    excludeTag: options.excludeTag ?? [],
  }
}
