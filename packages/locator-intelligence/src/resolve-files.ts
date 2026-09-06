import { resolve } from 'node:path'
import { type TestPilotConfig, isDirectory } from '@testpilot/core'
import { glob } from 'tinyglobby'

/** Never analyze dependencies, whatever the config says. */
const ALWAYS_IGNORED = ['**/node_modules/**']

interface SplitPatterns {
  /** Globs/paths the user typed — honored as written. */
  literal: string[]
  /** Directory arguments expanded with `config.include`. */
  expanded: string[]
}

/** Splits CLI patterns into literal globs and directory arguments expanded into test-file globs. */
function splitPatterns(cwd: string, patterns: string[], include: string[]): SplitPatterns {
  const literal: string[] = []
  const expanded: string[] = []
  for (const pattern of patterns) {
    if (isDirectory(resolve(cwd, pattern))) {
      const dir = pattern.replace(/[/\\]+$/, '')
      expanded.push(...include.map((suffix) => `${dir}/${suffix}`))
    } else {
      literal.push(pattern)
    }
  }
  return { literal, expanded }
}

/**
 * The directory test-file discovery — and therefore every reported path — is
 * relative to: `cwd` for explicit patterns, else `rootDir` (the config file's
 * directory, or the project root when there is no config file), falling back to
 * `cwd`. `analyze`, `fix`, and `doctor` all anchor here so they never disagree.
 */
export function discoveryBase(
  cwd: string,
  patterns: string[] | undefined,
  rootDir: string | undefined,
): string {
  const usingPatterns = patterns !== undefined && patterns.length > 0
  return usingPatterns ? cwd : (rootDir ?? cwd)
}

/**
 * Resolves the set of files to analyze, as sorted absolute paths.
 *
 * - When `patterns` are given (e.g. CLI positional globs), they are resolved
 *   relative to `cwd`. A pattern that is a directory expands to that directory's
 *   test files (using `config.include`), so `analyze examples/fragile-suite` works.
 * - Otherwise `config.include` is resolved relative to `config.testDir`, which is
 *   itself relative to `rootDir` (see {@link discoveryBase}).
 *
 * `config.exclude` applies wherever `config.include` chose the files — config-driven
 * discovery and directory arguments. A glob or path the user typed is honored as
 * written (only `node_modules` is skipped): `exclude` exists to keep discovery out of
 * build output, not to overrule an explicit request for `dist/e2e/a.spec.js`.
 */
export async function resolveTestFiles(
  cwd: string,
  patterns: string[] | undefined,
  config: TestPilotConfig,
  rootDir?: string,
): Promise<string[]> {
  const base = resolve(
    discoveryBase(cwd, patterns, rootDir),
    patterns !== undefined && patterns.length > 0 ? '.' : config.testDir,
  )
  const run = (globs: string[], ignore: string[]) =>
    globs.length === 0 ? [] : glob(globs, { cwd: base, absolute: true, ignore })

  const matches: string[] = []
  if (patterns !== undefined && patterns.length > 0) {
    const { literal, expanded } = splitPatterns(cwd, patterns, config.include)
    matches.push(...(await run(literal, ALWAYS_IGNORED)))
    matches.push(...(await run(expanded, config.exclude)))
  } else {
    matches.push(...(await run(config.include, config.exclude)))
  }

  return [...new Set(matches)].sort()
}
