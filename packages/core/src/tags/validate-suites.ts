import { type SuiteMap, isValidSuiteName } from './suites.js'
import { TagSelectionError, buildTagSelection } from './tag-selection.js'

export interface SuiteIssue {
  suite: string
  message: string
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
      issues.push({
        suite: name,
        message: `Suite name "${name}" cannot be written on the command line. Use letters, digits, "_" and "-", starting with a letter or digit.`,
      })
    }
    const entry = suites[name] ?? []
    if (entry.length === 0) {
      issues.push({
        suite: name,
        message: `Suite "${name}" is empty, so \`--suite ${name}\` would run every test.`,
      })
      continue
    }
    try {
      buildTagSelection({ tag: entry })
    } catch (error) {
      issues.push({
        suite: name,
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
export function unknownSuiteTags(entry: string[], vocabulary: ReadonlySet<string>): string[] {
  const unknown: string[] = []
  let selection: ReturnType<typeof buildTagSelection>
  try {
    selection = buildTagSelection({ tag: entry })
  } catch {
    // Malformed tokens are reported by validateSuites; do not double-report.
    return []
  }
  for (const tag of [...selection.include, ...selection.exclude]) {
    if (!vocabulary.has(tag)) {
      unknown.push(tag)
    }
  }
  return [...new Set(unknown)].sort()
}
