import type { ParseError } from '../analysis/types.js'
import type { ConfigDiscovery } from '../config/discovery.js'

/**
 * `tags` report schema.
 *
 * 1.0 — initial: tag vocabulary with per-tag test/file counts, untagged count,
 * and the configured suites resolved against that vocabulary.
 */
export const TAGS_SCHEMA_VERSION = '1.0'

export interface TagUsage {
  /** Tag name without the leading `@`. */
  tag: string
  /** Tests carrying this tag, including tags inherited from `test.describe`. */
  tests: number
  /** Files containing at least one test with this tag. */
  files: number
  /**
   * How the tag was written. A deliberate vocabulary is almost always
   * `details` (`{ tag: ['@smoke'] }`); `title` alone is often incidental text
   * Playwright happens to read as a tag — on mattermost, `@here`, `@all` and
   * `@channel` come from titles *about* Mattermost's @-mention feature.
   * Without this the two are indistinguishable in the report.
   */
  sources: Array<'title' | 'details'>
  /**
   * True when `--tag` can select this tag. False when its name contains a
   * comma, which the CLI splits on; `run -- --grep` is the escape hatch.
   */
  selectable: boolean
}

export interface SuiteUsage {
  name: string
  /** Tags the suite selects — any-of. */
  include: string[]
  /** Tags a test must carry all of. */
  all: string[]
  /** Tags the suite excludes. */
  exclude: string[]
  /** Referenced tags that no test carries — a typo, or a tag not written yet. */
  unknownTags: string[]
  /**
   * Tests the suite would select, or `null` when no honest count exists: the
   * suite references unknown tags, is malformed, or the vocabulary is knowingly
   * incomplete. A count over a vocabulary we know is wrong is worse than none.
   */
  matchingTests: number | null
  /** True when the suite's own tokens could not be parsed (see `doctor`). */
  malformed: boolean
}

export interface TagsSummary {
  filesAnalyzed: number
  filesWithParseErrors: number
  /** `test()` declarations found. */
  tests: number
  /** Tests carrying at least one tag. */
  taggedTests: number
  untaggedTests: number
  /** Distinct tags in the vocabulary. */
  distinctTags: number
  /**
   * Tests whose title is a template literal with interpolations. Text touching
   * an interpolation is not scanned at all (it fuses with the hole at runtime),
   * so this count is the honest bound on how complete the vocabulary is.
   */
  dynamicTitles: number
  /**
   * `{ tag: ... }` entries that could not be read statically — a spread, a
   * variable, or an interpolated template. Each is at least one tag the suite
   * carries and this report cannot name.
   */
  unreadableTagExpressions: number
  /**
   * Tests whose title is not a string literal at all (`test(name, fn)` in a
   * loop). No tag on such a test can be read from its title.
   */
  unreadableTitles: number
}

/**
 * Warning codes for `tags`.
 *
 * Deliberately its own union rather than an extension of `AnalysisWarning`:
 * `files-not-parsed` and `dynamic-test-titles` are meaningless for `analyze`,
 * and widening the shared type would change the `analyze` 1.7 contract (and
 * break a consumer's exhaustive `switch`) for a command that never emits them.
 */
export interface TagsWarning {
  code:
    | 'no-files-matched'
    | 'test-root-missing'
    | 'playwright-config-partial'
    // The vocabulary is incomplete by exactly this much.
    | 'files-not-parsed'
    | 'dynamic-test-titles'
    | 'unreadable-tag-expressions'
    | 'unreadable-test-titles'
    | 'no-tests-recognized'
    | 'unselectable-tags'
  message: string
}

export interface TagsReport {
  schemaVersion: string
  command: 'tags'
  /** Absolute base every reported path is relative to. */
  rootDir: string
  discovery: ConfigDiscovery
  summary: TagsSummary
  /** Vocabulary, most-used first, then alphabetical. */
  tags: TagUsage[]
  /** Suites from `testpilot.config.ts`, alphabetical. Empty when none configured. */
  suites: SuiteUsage[]
  warnings: TagsWarning[]
  parseErrors: ParseError[]
}
