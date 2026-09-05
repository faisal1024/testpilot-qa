import { readFileSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import { type FixEdit, computeFixes, resolveTestFiles } from '@testpilot/locator-intelligence'
import type { Command } from 'commander'
import { ExitCode } from '../util/exit-codes.js'
import { type GlobalOptions, readGlobalOptions } from '../util/global-options.js'
import { failIfNoFilesMatched } from '../util/no-files-matched.js'
import { OutputError, writeTextFile } from '../util/output.js'
import { resolveConfigOrExit } from '../util/resolve-config.js'
import { renderUnifiedDiff } from '../util/unified-diff.js'

interface FixOptions {
  write?: boolean
}

interface FileFixSummary {
  file: string
  fixes: FixEdit[]
  written: boolean
}

function fail(globals: GlobalOptions, message: string, code: number): never {
  if (!globals.quiet) {
    console.error(message)
  }
  process.exit(code)
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
  const { config, filepath } = await resolveConfigOrExit(globals)
  const write = options.write === true

  const files = await resolveTestFiles(
    globals.cwd,
    patterns.length > 0 ? patterns : undefined,
    config,
    filepath ? dirname(filepath) : undefined,
  )
  failIfNoFilesMatched(globals, files.length, patterns, config, filepath)

  const results: FileFixSummary[] = []
  const diffs: string[] = []
  let skipped = 0
  for (const absolute of files) {
    const display = relative(globals.cwd, absolute) || absolute
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
    results.push({ file: display, fixes: result.fixes, written: write })
    if (!write) {
      diffs.push(renderUnifiedDiff(display, code, result.output))
    }
  }

  report(results, diffs, write, skipped, globals)
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
): void {
  if (globals.json) {
    console.log(
      JSON.stringify({
        command: 'fix',
        dryRun: !write,
        files: results.map((r) => ({ file: r.file, written: r.written, fixes: r.fixes })),
        summary: { files: results.length, fixes: totalFixes(results), skipped },
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
      console.log(`  ✓ ${result.file} (${result.fixes.length} fix(es))`)
    }
    console.log('')
    console.log(`Applied ${count} fix(es) across ${results.length} file(s).`)
  }

  // Non-fatal heads-up so "fix did nothing" is never ambiguous.
  if (skipped > 0) {
    console.error(`Skipped ${skipped} file(s) that could not be read or parsed.`)
  }
}
