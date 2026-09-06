import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'
import {
  type FixEdit,
  computeFixes,
  discoveryBase,
  resolveFiles,
} from '@testpilot/locator-intelligence'
import type { Command } from 'commander'
import { ExitCode } from '../util/exit-codes.js'
import { fail } from '../util/fail.js'
import { type GlobalOptions, readGlobalOptions } from '../util/global-options.js'
import { failNoFilesMatched } from '../util/no-files-matched.js'
import { OutputError, writeTextFile } from '../util/output.js'
import {
  type DiscoveryResult,
  discoveryWarnings,
  resolveDiscoveryOrExit,
} from '../util/resolve-config.js'
import { renderUnifiedDiff } from '../util/unified-diff.js'

interface FixOptions {
  write?: boolean
  withHelpers?: boolean
}

interface FileFixSummary {
  file: string
  fixes: FixEdit[]
  written: boolean
  /** Playwright does not run this file — see `--with-helpers`. */
  inHelper?: boolean
}

/**
 * `testpilot fix [patterns...]` — apply safe, mechanical locator rewrites.
 *
 * **Dry-run by default**: prints a unified diff of what would change and writes
 * nothing. `--write` applies the fixes. Only behavior-preserving, syntactic
 * rewrites are made (today: `locator('text=Foo')` → `getByText('Foo')`); anything
 * ambiguous is left untouched. Operates on the same test files as `analyze`; it
 * never touches application code and never calls an LLM or inspects the DOM.
 */
export async function fixCommand(
  patterns: string[],
  options: FixOptions,
  command: Command,
): Promise<void> {
  const globals = readGlobalOptions(command)
  const resolved = await resolveDiscoveryOrExit(globals, patterns, {
    includeHelpers: options.withHelpers === true,
  })
  const { config, filepath, discovery, rootDir } = resolved
  const write = options.write === true

  const explicitPatterns = patterns.length > 0 ? patterns : undefined
  const { files, helpers, helpersNotAnalyzed } = await resolveFiles({
    cwd: globals.cwd,
    patterns: explicitPatterns,
    config,
    rootDir,
    scopes: resolved.scopes,
  })
  if (files.length === 0) {
    failNoFilesMatched(globals, patterns, resolved, filepath, resolved.rootDir)
  }
  // Exactly the base `analyze` reports against, so the two commands agree and a
  // dry-run diff still applies from the project root.
  const displayBase = discoveryBase(globals.cwd, explicitPatterns, rootDir)

  const results: FileFixSummary[] = []
  const diffs: string[] = []
  let skipped = 0
  for (const absolute of files) {
    const display = (relative(displayBase, absolute) || absolute).split(sep).join('/')
    let code: string
    try {
      code = readFileSync(absolute, 'utf8')
    } catch {
      skipped += 1 // unreadable — skip untouched (analyze reports these separately)
      continue
    }

    let result: ReturnType<typeof computeFixes>
    try {
      result = computeFixes(code, absolute)
    } catch {
      skipped += 1 // parse error — never touch a file we can't parse
      continue
    }
    if (result.fixes.length === 0) continue

    if (write && result.output !== code) {
      try {
        writeTextFile(absolute, result.output)
      } catch (error) {
        if (error instanceof OutputError) {
          fail(globals, error.message, ExitCode.USAGE)
        }
        throw error
      }
    }
    results.push({
      file: display,
      fixes: result.fixes,
      written: write,
      ...(helpers.has(absolute) ? { inHelper: true } : {}),
    })
    if (!write) {
      diffs.push(renderUnifiedDiff(display, code, result.output))
    }
  }

  if (helpersNotAnalyzed > 0 && !globals.quiet && !globals.json) {
    // `fix` rewrites tests while leaving the layer that holds most of the locators
    // untouched — the same gap `analyze` now discloses, with a write attached.
    console.error(
      `[testpilot] ${helpersNotAnalyzed} page object/fixture file(s) were not considered. Add --with-helpers to fix those too.`,
    )
  }
  report(results, diffs, write, skipped, globals, resolved)
}

function totalFixes(results: FileFixSummary[]): number {
  return results.reduce((sum, r) => sum + r.fixes.length, 0)
}

function report(
  results: FileFixSummary[],
  diffs: string[],
  write: boolean,
  skipped: number,
  globals: GlobalOptions,
  resolved: DiscoveryResult,
): void {
  if (globals.json) {
    console.log(
      JSON.stringify({
        command: 'fix',
        dryRun: !write,
        files: results.map((r) => ({
          file: r.file,
          written: r.written,
          fixes: r.fixes,
          ...(r.inHelper ? { inHelper: true } : {}),
        })),
        summary: { files: results.length, fixes: totalFixes(results), skipped },
        // This is the write path: it must be at least as loud as `analyze` about a
        // file set chosen by a half-read or mis-adopted Playwright config.
        discovery: resolved.discovery,
        warnings: discoveryWarnings(resolved.discovery),
      }),
    )
    return
  }
  if (globals.quiet) {
    return
  }

  const count = totalFixes(results)
  if (count === 0) {
    console.log('No mechanical fixes available.')
  } else if (!write) {
    for (const diff of diffs) {
      if (diff) console.log(diff)
    }
    console.log('')
    console.log(
      `${count} mechanical fix(es) available across ${results.length} file(s). Re-run with --write to apply.`,
    )
  } else {
    for (const result of results) {
      // The write path must be at least as clear as `analyze` about which files
      // Playwright never runs.
      const scope = result.inHelper ? ' [helper]' : ''
      console.log(`  ✓ ${result.file}${scope} (${result.fixes.length} fix(es))`)
    }
    console.log('')
    console.log(`Applied ${count} fix(es) across ${results.length} file(s).`)
  }

  // Non-fatal heads-up so "fix did nothing" is never ambiguous.
  if (skipped > 0) {
    console.error(`Skipped ${skipped} file(s) that could not be read or parsed.`)
  }
}
