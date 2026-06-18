import { join } from 'node:path'
import type { TestPilotConfig } from '@testpilot/core'
import { glob } from 'tinyglobby'

/**
 * Resolves the set of files to analyze, as sorted absolute paths.
 *
 * - When `patterns` are given (e.g. CLI positional globs), they are resolved
 *   relative to `cwd`.
 * - Otherwise `config.include` is resolved relative to `cwd/config.testDir`.
 */
export async function resolveTestFiles(
  cwd: string,
  patterns: string[] | undefined,
  config: TestPilotConfig,
): Promise<string[]> {
  const usingPatterns = patterns !== undefined && patterns.length > 0
  const globs = usingPatterns ? patterns : config.include
  const base = usingPatterns ? cwd : join(cwd, config.testDir)

  const matches = await glob(globs, {
    cwd: base,
    absolute: true,
    ignore: ['**/node_modules/**'],
  })

  return [...new Set(matches)].sort()
}
