import {
  type SuiteDefinition,
  type SuiteMap,
  isEmptySuite,
  isValidSuiteName,
  suiteTokens,
} from './suites.js'
import { TagSelectionError, buildTagSelection } from './tag-selection.js'

export interface SuiteIssue {
  suite: string
  message: string
  /**
   * `fail` — the suite cannot do what it says (empty, or a malformed tag).
   * `warn` — the suite works, but is awkward. Never fail a working config.
   */
  severity: 'fail' | 'warn'
}

/**
 * Checks configured suites without needing the test sources.
 *
 * Structural only: names, empty suites, malformed tag tokens, and a suite that
 * both includes and excludes the same tag. Whether a referenced tag actually
 * exists needs the vocabulary — see {@link unknownSuiteTags}.
 */
export function validateSuites(suites: SuiteMap): SuiteIssue[] {
  const issues: SuiteIssue[] = []
  for (const name of Object.keys(suites).sort()) {
    if (!isValidSuiteName(name)) {
      // A warning, not a failure: `--suite 'bad name'` genuinely works — the
      // shell quotes it and `expandSuites` finds it. Failing CI over a config
      // that runs correctly is worse than the awkwardness it complains about.
      issues.push({
        suite: name,
        severity: 'warn',
        message: `Suite name "${name}" needs quoting on the command line (\`--suite '${name}'\`). Letters, digits, "_" and "-" avoid that.`,
      })
    }
    const entry = suites[name] ?? []
    if (isEmptySuite(entry)) {
      issues.push({
        suite: name,
        severity: 'fail',
        message: `Suite "${name}" is empty, so \`--suite ${name}\` would run every test.`,
      })
      continue
    }
    try {
      buildTagSelection(selectionInputForSuite(entry))
    } catch (error) {
      issues.push({
        suite: name,
        severity: 'fail',
        message: `Suite "${name}": ${error instanceof TagSelectionError ? error.message : String(error)}`,
      })
    }
  }
  return issues
}

/**
 * Tags a suite references that no test carries.
 *
 * This is the check that makes a typo fail loudly. `--suite nighlty` already
 * errors on the suite name; `suites: { nightly: ['regresion'] }` would
 * otherwise run zero tests and exit 0.
 */
export function unknownSuiteTags(
  entry: SuiteDefinition,
  vocabulary: ReadonlySet<string>,
): string[] {
  const unknown: string[] = []
  let selection: ReturnType<typeof buildTagSelection>
  try {
    selection = buildTagSelection(selectionInputForSuite(entry))
  } catch {
    // Malformed tokens are reported by validateSuites; do not double-report.
    return []
  }
  for (const tag of [...selection.include, ...selection.all, ...selection.exclude]) {
    if (!vocabulary.has(tag)) {
      unknown.push(tag)
    }
  }
  return [...new Set(unknown)].sort()
}

/** Both suite forms, as {@link buildTagSelection} input. */
export function selectionInputForSuite(entry: SuiteDefinition) {
  const tokens = suiteTokens(entry)
  return { tag: tokens.any, allTag: tokens.all, excludeTag: tokens.none }
}
