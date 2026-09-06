import { resolve } from 'node:path'
import { type TestPilotConfig, isDirectory } from '@testpilot/core'
import { glob } from 'tinyglobby'

/** Never analyze dependencies, whatever the config says. */
const ALWAYS_IGNORED = ['**/node_modules/**']

/** Candidate set when a Playwright RegExp `testMatch` decides membership. */
const ANY_SOURCE_FILE = ['**/*.{ts,tsx,js,jsx,mjs,cjs}']

export interface ResolveFilesOptions {
  cwd: string
  patterns?: string[]
  config: TestPilotConfig
  /** Anchor for config-driven discovery — see {@link discoveryBase}. */
  rootDir?: string
  /** Absolute test roots; defaults to `<discoveryBase>/<config.testDir>`. */
  roots?: string[]
  /** Playwright RegExp `testMatch` sources, matched against the absolute path. */
  matchRegex?: string[]
  /** Playwright RegExp `testIgnore` sources. */
  ignoreRegex?: string[]
}

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

function compile(sources: string[] | undefined): RegExp[] {
  const out: RegExp[] = []
  for (const source of sources ?? []) {
    try {
      out.push(new RegExp(source))
    } catch {
      // A pattern we cannot compile simply selects nothing extra.
    }
  }
  return out
}

/**
 * Resolves the set of files to analyze, as sorted absolute paths.
 *
 * - When `patterns` are given (e.g. CLI positional globs), they are resolved
 *   relative to `cwd`. A pattern that is a directory expands to that directory's
 *   test files (using `config.include`), so `analyze examples/fragile-suite` works.
 * - Otherwise `config.include` is resolved under each test root (`roots`, or
 *   `<discoveryBase>/<config.testDir>`).
 *
 * `config.exclude` applies wherever `config.include` chose the files — config-driven
 * discovery and directory arguments. A glob or path the user typed is honored as
 * written (only `node_modules` is skipped): `exclude` exists to keep discovery out of
 * build output, not to overrule an explicit request for `dist/e2e/a.spec.js`.
 *
 * `matchRegex` / `ignoreRegex` carry Playwright's RegExp selectors, which have no
 * faithful glob translation. They are matched against the absolute path, as
 * Playwright does, over a broad candidate set.
 */
export async function resolveTestFiles(options: ResolveFilesOptions): Promise<string[]> {
  const { cwd, patterns, config } = options
  const usingPatterns = patterns !== undefined && patterns.length > 0
  const matchRegex = compile(options.matchRegex)
  const ignoreRegex = compile(options.ignoreRegex)

  const roots = usingPatterns
    ? [cwd]
    : options.roots && options.roots.length > 0
      ? options.roots
      : [resolve(discoveryBase(cwd, patterns, options.rootDir), config.testDir)]

  const matches: string[] = []
  const run = async (base: string, globs: string[], ignore: string[]) => {
    if (globs.length === 0) return
    matches.push(...(await glob(globs, { cwd: base, absolute: true, ignore })))
  }

  if (usingPatterns) {
    const { literal, expanded } = splitPatterns(cwd, patterns, config.include)
    await run(cwd, literal, ALWAYS_IGNORED)
    await run(cwd, expanded, config.exclude)
  } else {
    for (const base of roots) {
      await run(base, config.include, config.exclude)
      if (matchRegex.length > 0) {
        const candidates = await glob(ANY_SOURCE_FILE, {
          cwd: base,
          absolute: true,
          ignore: config.exclude,
        })
        matches.push(...candidates.filter((file) => matchRegex.some((re) => re.test(file))))
      }
    }
  }

  const unique = [...new Set(matches)]
  const kept =
    ignoreRegex.length === 0
      ? unique
      : unique.filter((file) => !ignoreRegex.some((re) => re.test(file)))
  return kept.sort()
}
