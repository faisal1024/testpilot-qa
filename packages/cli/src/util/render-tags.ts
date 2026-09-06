import { type TagsReport, describeTagSelection } from '@testpilot/core'

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length)
}

function padStart(value: string, width: number): string {
  return value.length >= width ? value : ' '.repeat(width - value.length) + value
}

/**
 * Renders the tag vocabulary. Presentation only — the engine stays
 * output-agnostic, same as `render-analysis`.
 */
export function renderTagsText(report: TagsReport): string {
  const { summary, tags, suites, warnings, parseErrors } = report
  const lines: string[] = []

  if (report.discovery?.playwrightConfigPath) {
    lines.push(
      `Scanned ${report.discovery.roots.join(', ')} (from ${report.discovery.playwrightConfigPath})`,
    )
  }
  for (const warning of warnings) {
    lines.push(`⚠ ${warning.message}`)
  }

  const declarationNote =
    summary.tests === 1 ? '1 test declaration' : `${summary.tests} test declarations`

  if (tags.length === 0) {
    lines.push(
      `No tags found in ${declarationNote} across ${summary.filesAnalyzed} file(s).`,
      '',
      'Tag a test by putting `@smoke` in its title, or with the details argument:',
      "  test('checkout works', { tag: ['@smoke'] }, async ({ page }) => { … })",
      'Then run just those tests with `testpilot run --tag smoke`.',
    )
  } else {
    const tagWidth = Math.max(3, ...tags.map((usage) => usage.tag.length + 1))
    const testsWidth = Math.max(5, ...tags.map((usage) => String(usage.tests).length))
    lines.push(`${pad('TAG', tagWidth)}  ${padStart('TESTS', testsWidth)}  FILES  DECLARED`)
    for (const usage of tags) {
      // A tag written only in a title is often incidental prose Playwright
      // happens to read as a tag (`@here`, `@channel`); one written with
      // `{ tag: [...] }` is always deliberate. Without this column a reader
      // cannot tell the vocabulary from the noise.
      const declared = usage.sources.length > 0 ? usage.sources.join('+') : 'inherited'
      const marker = usage.selectable ? '' : '  (not selectable with --tag)'
      lines.push(
        `${pad(`@${usage.tag}`, tagWidth)}  ${padStart(String(usage.tests), testsWidth)}  ${String(usage.files).padEnd(5)}  ${declared}${marker}`,
      )
    }
    lines.push('')
    lines.push(
      `${summary.distinctTags} tag(s) across ${declarationNote} in ${summary.filesAnalyzed} file(s); ${summary.untaggedTests} untagged.`,
    )
  }

  if (suites.length > 0) {
    lines.push('')
    lines.push('Suites (testpilot.config.ts):')
    for (const suite of suites) {
      // Reuse the compiler's own prose rather than re-deriving it here: the
      // first version of this loop forgot `all` entirely and printed
      // "all tests" for an all-of suite, contradicting the count beside it.
      const what = suite.malformed
        ? 'cannot be read'
        : describeTagSelection({
            include: suite.include,
            all: suite.all,
            exclude: suite.exclude,
          })
      const count = suite.malformed
        ? 'run `testpilot doctor`'
        : suite.matchingTests === null
          ? 'count unavailable'
          : `${suite.matchingTests} test declaration(s)`
      lines.push(`  ${suite.name}: ${what} — ${count}`)
      if (suite.unknownTags.length > 0) {
        // A suite naming a tag no test carries runs the wrong set silently. Say it
        // here as well as in `doctor`, because this is the command people read.
        lines.push(
          `    ⚠ no test carries ${suite.unknownTags.map((tag) => `@${tag}`).join(', ')} — \`testpilot run --suite ${suite.name}\` would not select what you expect.`,
        )
      }
    }
  }

  if (parseErrors.length > 0) {
    lines.push('')
    for (const error of parseErrors) {
      lines.push(`  ${error.file}: ${error.message}`)
    }
  }

  return lines.join('\n')
}
