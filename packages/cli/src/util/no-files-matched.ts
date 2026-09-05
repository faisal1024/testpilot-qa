import type { TestPilotConfig } from '@testpilot/core'
import { ExitCode } from './exit-codes.js'
import { fail } from './fail.js'
import type { GlobalOptions } from './global-options.js'

/**
 * A run that matched zero test files must never look like a clean pass — before
 * this guard a TypeScript-only `include` on a JavaScript suite scored 100/A and
 * exited 0, which is exactly the false green a quality gate exists to prevent.
 *
 * Exit code follows the source of the (empty) selection: explicit CLI patterns
 * are a usage problem (2); config-driven discovery is a config problem (3).
 */
export function failIfNoFilesMatched(
  globals: GlobalOptions,
  fileCount: number,
  patterns: string[],
  config: TestPilotConfig,
  configPath: string | null,
): void {
  if (fileCount > 0) return
  if (patterns.length > 0) {
    fail(
      globals,
      `No test files matched ${patterns.join(', ')} (from ${globals.cwd}). Check the pattern, or omit it to use the config's testDir/include.`,
      ExitCode.USAGE,
    )
  }
  const source = configPath ?? 'the built-in defaults (no config file found)'
  fail(
    globals,
    [
      `No test files matched include ${JSON.stringify(config.include)} under testDir "${config.testDir}" (from ${source}).`,
      'Set testDir/include in testpilot.config.ts to point at your suite, or pass explicit patterns: testpilot analyze "e2e/**/*.spec.ts".',
    ].join('\n'),
    ExitCode.CONFIG,
  )
}
