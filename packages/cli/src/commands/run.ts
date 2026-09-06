import {
  ConfigError,
  type TagSelection,
  TagSelectionError,
  buildTagSelection,
  describeTagSelection,
  findConflictingGrep,
  findPlaywrightConfig,
  findProjectRoot,
  isEmptySelection,
  loadConfig,
  resolvePlaywrightBin,
  runPlaywright,
  selectionInputFor,
  tagSelectionArgs,
} from '@testpilot/core'
import type { Command } from 'commander'
import { ExitCode } from '../util/exit-codes.js'
import { type GlobalOptions, readGlobalOptions } from '../util/global-options.js'

export interface RunOptions {
  tag?: string[]
  excludeTag?: string[]
  suite?: string[]
}

export async function runCommand(options: RunOptions, command: Command): Promise<void> {
  const globals = readGlobalOptions(command)
  // Operands after the `run` command (including everything after `--`) are
  // forwarded verbatim to Playwright.
  const forwardedArgs = command.args

  const config = await loadProjectConfig(globals)

  // `--suite` and `--tag` both say what to *include*, and there is no reading of
  // the pair that is obviously right: "the nightly suite plus the smoke tests"
  // and "the nightly suite narrowed to smoke" are equally natural, and an
  // all-of suite silently produced the second. Refuse rather than pick one.
  // `--exclude-tag` still composes: narrowing a suite is unambiguous.
  if ((options.suite ?? []).length > 0 && (options.tag ?? []).length > 0) {
    if (!globals.quiet) {
      console.error(
        'Cannot combine --suite with --tag: both choose what to include, and whether that means "either" or "both" is ambiguous. Use one, or narrow the suite with --exclude-tag.',
      )
    }
    process.exit(ExitCode.USAGE)
  }

  let selection: TagSelection
  try {
    selection = buildTagSelection(
      selectionInputFor({
        suites: config.suites,
        suite: options.suite,
        tag: options.tag,
        excludeTag: options.excludeTag,
      }),
    )
  } catch (error) {
    if (error instanceof TagSelectionError) {
      if (!globals.quiet) {
        console.error(error.message)
      }
      process.exit(ExitCode.USAGE)
    }
    throw error
  }

  // Playwright keeps the last occurrence of a repeated flag, so appending ours
  // after a hand-written one would silently discard one of the two filters.
  if (!isEmptySelection(selection)) {
    const conflict = findConflictingGrep(forwardedArgs)
    if (conflict) {
      if (!globals.quiet) {
        console.error(
          `Cannot combine --tag/--suite with a forwarded ${conflict}: Playwright would keep only one of them. Use one or the other.`,
        )
      }
      process.exit(ExitCode.USAGE)
    }
  }

  const tagArgs = tagSelectionArgs(selection)

  const projectRoot = findProjectRoot(globals.cwd)
  const binPath = resolvePlaywrightBin(projectRoot)
  if (!binPath) {
    if (!globals.quiet) {
      console.error(`Playwright is not installed in ${projectRoot}.`)
      console.error('Run `npm install` first — the generated project depends on @playwright/test.')
    }
    process.exit(ExitCode.ENV)
  }

  const playwrightConfigPath = findPlaywrightConfig(projectRoot, config.playwrightConfig)

  if (!globals.quiet) {
    console.error(`[testpilot] Running Playwright in ${projectRoot}`)
    console.error(
      `[testpilot] Playwright config: ${playwrightConfigPath ?? '(Playwright default discovery)'}`,
    )
    if (tagArgs.length > 0) {
      // Print the compiled flags, not just the intent: a team that drops
      // TestPilot should be able to paste these straight into their own CI.
      console.error(`[testpilot] Tags: ${describeTagSelection(selection)}`)
      console.error(`[testpilot] Compiled to: ${tagArgs.map(quoteForDisplay).join(' ')}`)
    }
    if (forwardedArgs.length > 0) {
      console.error(`[testpilot] Forwarding to Playwright: ${forwardedArgs.join(' ')}`)
    }
  }

  const code = await runPlaywright({
    projectRoot,
    binPath,
    playwrightConfigPath,
    // Tag flags go first so an explicit forwarded flag still wins on anything
    // else; a forwarded --grep is refused above rather than silently overridden.
    forwardedArgs: [...tagArgs, ...forwardedArgs],
  })
  process.exit(code)
}

/** Quotes a compiled flag value so the printed line is copy-pasteable into a shell. */
function quoteForDisplay(value: string): string {
  return /^[\w.:/=-]+$/.test(value) ? value : `'${value.split("'").join(`'\\''`)}'`
}

async function loadProjectConfig(globals: GlobalOptions) {
  try {
    const result = await loadConfig({ cwd: globals.cwd, configPath: globals.configPath })
    return result.config
  } catch (error) {
    if (error instanceof ConfigError) {
      if (!globals.quiet) {
        console.error(error.message)
      }
      process.exit(ExitCode.CONFIG)
    }
    throw error
  }
}
