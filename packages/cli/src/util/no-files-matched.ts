import { resolve } from 'node:path'
import {
  type ConfigDiscovery,
  type TestPilotConfig,
  formatDiscoverySource,
  isDirectory,
} from '@testpilot/core'
import { ExitCode } from './exit-codes.js'
import { fail } from './fail.js'
import type { GlobalOptions } from './global-options.js'

/**
 * A run that matched zero test files must never look like a clean pass — before
 * this guard a TypeScript-only `include` on a JavaScript suite scored 100/A and
 * exited 0, which is exactly the false green a quality gate exists to prevent.
 *
 * Exit code follows the source of the (empty) selection:
 * - explicit globs that matched nothing → usage problem (2);
 * - config-driven discovery, or directory arguments (which are expanded with the
 *   config's `include`) → config problem (3), pointing at `include`/`exclude`.
 */
export function failNoFilesMatched(
  globals: GlobalOptions,
  patterns: string[],
  config: TestPilotConfig,
  configPath: string | null,
  discovery: ConfigDiscovery,
): never {
  // Name the real source. Attributing a Playwright-supplied glob to "the built-in
  // defaults" sends the user to edit a file that has nothing to do with the problem.
  const includeHint = `include ${JSON.stringify(config.include)} ${formatDiscoverySource(discovery, 'include')} (exclude ${formatDiscoverySource(discovery, 'exclude')})`
  if (patterns.length > 0) {
    const allDirectories = patterns.every((pattern) => isDirectory(resolve(globals.cwd, pattern)))
    if (allDirectories) {
      fail(
        globals,
        [
          `No test files matched under ${patterns.join(', ')} using ${includeHint}.`,
          'A directory argument is expanded with the config\'s include patterns — set include/exclude in testpilot.config.ts, or pass a glob: testpilot analyze "e2e/**/*.ts".',
        ].join('\n'),
        ExitCode.CONFIG,
      )
    }
    fail(
      globals,
      `No test files matched ${patterns.join(', ')} (from ${globals.cwd}). Check the pattern, or omit it to use the config's testDir/include.`,
      ExitCode.USAGE,
    )
  }
  fail(
    globals,
    [
      `No test files matched ${includeHint} under testDir "${config.testDir}" (${formatDiscoverySource(discovery, 'testDir')}${configPath ? `, config ${configPath}` : ''}).`,
      ...(discovery.playwrightConfigIgnored
        ? [
            `A Playwright config was found at ${discovery.playwrightConfigIgnored.path} but not used for discovery: ${discovery.playwrightConfigIgnored.reason}.`,
          ]
        : []),
      'Set testDir/include in testpilot.config.ts to point at your suite, or pass explicit patterns: testpilot analyze "e2e/**/*.spec.ts".',
    ].join('\n'),
    ExitCode.CONFIG,
  )
}
