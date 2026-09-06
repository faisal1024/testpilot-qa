import type { TagsReport } from '@testpilot/core'

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

  if (tags.length === 0) {
    lines.push(
      `No tags found in ${summary.tests} test(s) across ${summary.filesAnalyzed} file(s).`,
      '',
      'Tag a test by putting `@smoke` in its title, or with the details argument:',
      "  test('checkout works', { tag: ['@smoke'] }, async ({ page }) => { … })",
      'Then run just those tests with `testpilot run --tag smoke`.',
    )
  } else {
    const tagWidth = Math.max(3, ...tags.map((usage) => usage.tag.length + 1))
    const testsWidth = Math.max(5, ...tags.map((usage) => String(usage.tests).length))
    lines.push(`${pad('TAG', tagWidth)}  ${padStart('TESTS', testsWidth)}  FILES`)
    for (const usage of tags) {
      lines.push(
        `${pad(`@${usage.tag}`, tagWidth)}  ${padStart(String(usage.tests), testsWidth)}  ${usage.files}`,
      )
    }
    lines.push('')
    lines.push(
      `${summary.distinctTags} tag(s) across ${summary.tests} test(s) in ${summary.filesAnalyzed} file(s); ${summary.untaggedTests} untagged.`,
    )
  }

  if (suites.length > 0) {
    lines.push('')
    lines.push('Suites (testpilot.config.ts):')
    for (const suite of suites) {
      const parts: string[] = []
      if (suite.include.length > 0) {
        parts.push(suite.include.map((tag) => `@${tag}`).join(' or '))
      } else {
        parts.push('all tests')
      }
      if (suite.exclude.length > 0) {
        parts.push(`excluding ${suite.exclude.map((tag) => `@${tag}`).join(' and ')}`)
      }
      const count =
        suite.matchingTests === null ? 'unknown tag(s)' : `${suite.matchingTests} test(s)`
      lines.push(`  ${suite.name}: ${parts.join(', ')} — ${count}`)
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
