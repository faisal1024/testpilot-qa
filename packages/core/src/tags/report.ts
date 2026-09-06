import type { AnalysisWarning, ParseError } from '../analysis/types.js'
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
}

export interface SuiteUsage {
  name: string
  /** Tags the suite selects. */
  include: string[]
  /** Tags the suite excludes. */
  exclude: string[]
  /** Referenced tags that no test carries — a typo, or a tag not written yet. */
  unknownTags: string[]
  /** Tests the suite would select, or `null` when it references unknown tags. */
  matchingTests: number | null
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
   * Tests whose title is a template literal with interpolations. Their static
   * parts are scanned, but a tag inside `${}` cannot be seen — so this count is
   * the honest bound on how complete the vocabulary is.
   */
  dynamicTitles: number
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
  warnings: AnalysisWarning[]
  parseErrors: ParseError[]
}
