import { resolve } from 'node:path'
import { collectTags } from '@testpilot/locator-intelligence'
import type { Command } from 'commander'
import { ExitCode } from '../util/exit-codes.js'
import { fail } from '../util/fail.js'
import { readGlobalOptions } from '../util/global-options.js'
import { failNoFilesMatched } from '../util/no-files-matched.js'
import { OutputError, writeJsonFile } from '../util/output.js'
import { renderTagsText } from '../util/render-tags.js'
import { resolveDiscoveryOrExit } from '../util/resolve-config.js'

interface TagsOptions {
  output?: string
}

/**
 * Lists the tag vocabulary of a suite, statically.
 *
 * This is the discoverability half of tag-based running: `--grep` can filter,
 * but it can never tell you what there is to filter by.
 */
export async function tagsCommand(
  patterns: string[],
  options: TagsOptions,
  command: Command,
): Promise<void> {
  const globals = readGlobalOptions(command)

  const resolved = await resolveDiscoveryOrExit(globals, patterns)
  const report = await collectTags({
    cwd: globals.cwd,
    config: resolved.config,
    patterns: patterns.length > 0 ? patterns : undefined,
    rootDir: resolved.rootDir,
    scopes: resolved.scopes,
    discovery: resolved.discovery,
  })

  // Zero files is a discovery failure, not an empty vocabulary — the same guard
  // `analyze` uses, for the same reason: "no tags" would read as a clean answer.
  if (report.summary.filesAnalyzed === 0) {
    failNoFilesMatched(globals, patterns, resolved, resolved.filepath, resolved.rootDir)
  }

  if (options.output) {
    try {
      writeJsonFile(resolve(globals.cwd, options.output), report)
    } catch (error) {
      if (error instanceof OutputError) {
        fail(globals, error.message, ExitCode.USAGE)
      }
      throw error
    }
    if (!globals.quiet) {
      console.log(`Tag report written to ${options.output}.`)
    }
    return
  }

  if (globals.json) {
    console.log(JSON.stringify(report))
  } else if (!globals.quiet) {
    console.log(renderTagsText(report))
  }
}
