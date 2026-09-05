import { resolve } from 'node:path'
import { type TestPilotConfig, isDirectory } from '@testpilot/core'
import { glob } from 'tinyglobby'

/** Expands any pattern that is an existing directory into that directory's test-file globs. */
function expandDirectoryPatterns(cwd: string, patterns: string[], include: string[]): string[] {
  return patterns.flatMap((pattern) => {
    if (isDirectory(resolve(cwd, pattern))) {
      const dir = pattern.replace(/[/\\]+$/, '')
      return include.map((suffix) => `${dir}/${suffix}`)
    }
    return [pattern]
  })
}

/**
 * Resolves the set of files to analyze, as sorted absolute paths.
 *
 * - When `patterns` are given (e.g. CLI positional globs), they are resolved
 *   relative to `cwd`. A pattern that is a directory expands to that directory's
 *   test files (using `config.include`), so `analyze examples/fragile-suite` works.
 * - Otherwise `config.include` is resolved relative to `config.testDir`, which is
 *   itself relative to `configDir` — the directory of the loaded config file —
 *   so running from a sub-directory of a monorepo still finds the suite.
 *   Falls back to `cwd` when no config file exists.
 */
export async function resolveTestFiles(
  cwd: string,
  patterns: string[] | undefined,
  config: TestPilotConfig,
  configDir?: string,
): Promise<string[]> {
  const usingPatterns = patterns !== undefined && patterns.length > 0
  const globs = usingPatterns
    ? expandDirectoryPatterns(cwd, patterns, config.include)
    : config.include
  const base = usingPatterns ? cwd : resolve(configDir ?? cwd, config.testDir)

  const matches = await glob(globs, {
    cwd: base,
    absolute: true,
    ignore: ['**/node_modules/**'],
  })

  return [...new Set(matches)].sort()
}
