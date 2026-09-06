import { resolve } from 'node:path'
import {
  type DiscoveryScope,
  type RegexPattern,
  type TestPilotConfig,
  isDirectory,
} from '@testpilot/core'
import picomatch from 'picomatch'
import { glob } from 'tinyglobby'

const toPosix = (path: string): string => path.split('\\').join('/')

/** Never analyzed, whatever the config says: dependencies and tool caches. */
const ALWAYS_IGNORED = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/.yarn/**',
  '**/.venv/**',
]

/** Candidate set when a Playwright RegExp `testMatch` decides membership. */
const ANY_SOURCE_FILE = ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']

/** One directory to scan with the selectors that apply to it (see `resolveDiscovery`). */
export type FileScope = DiscoveryScope

export interface ResolveFilesOptions {
  cwd: string
  patterns?: string[]
  config: TestPilotConfig
  /** Anchor for config-driven discovery — see {@link discoveryBase}. */
  rootDir?: string
  /** Scopes to scan; defaults to one built from `config` under `<discoveryBase>/<testDir>`. */
  scopes?: FileScope[]
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

function compile(patterns: RegexPattern[] | undefined): RegExp[] {
  const out: RegExp[] = []
  for (const pattern of patterns ?? []) {
    try {
      // Flags matter: Playwright's `/…/i` matchers select files a case-sensitive
      // compile would miss.
      out.push(new RegExp(pattern.source, pattern.flags))
    } catch {
      // A pattern we cannot compile selects nothing extra.
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
  const matches: string[] = []

  // `ALWAYS_IGNORED` is unconditional: `exclude` replaces its default when the user
  // sets it, and nothing — least of all `fix --write` — may touch dependency code.
  const run = async (base: string, globs: string[], ignore: string[], dot = false) => {
    if (globs.length === 0) return []
    return glob(globs, { cwd: base, absolute: true, dot, ignore: [...ALWAYS_IGNORED, ...ignore] })
  }

  if (usingPatterns) {
    const { literal, expanded } = splitPatterns(cwd, patterns, config.include)
    matches.push(...(await run(cwd, literal, [])))
    matches.push(...(await run(cwd, expanded, config.exclude)))
    return [...new Set(matches)].sort()
  }

  const scopes: FileScope[] = options.scopes?.length
    ? options.scopes
    : [
        {
          root: resolve(discoveryBase(cwd, patterns, options.rootDir), config.testDir),
          includeGlobs: config.include,
          matchGlobs: [],
          matchRegex: [],
          excludeGlobs: config.exclude,
          ignoreGlobs: [],
          ignoreRegex: [],
        },
      ]

  for (const scope of scopes) {
    const ignoreRegex = compile(scope.ignoreRegex)
    const matchRegex = compile(scope.matchRegex)
    const found = [...(await run(scope.root, scope.includeGlobs, scope.excludeGlobs))]
    if (matchRegex.length > 0 || scope.matchGlobs.length > 0) {
      // Playwright matches `testMatch` against the absolute path, so these are applied
      // to the enumerated candidates rather than rooted at `scope.root`. The candidate
      // scan must see dot-directories too, or the matcher's `dot` support is a lie.
      const matchGlob =
        scope.matchGlobs.length > 0 ? picomatch(scope.matchGlobs, { dot: true }) : null
      const candidates = await run(scope.root, ANY_SOURCE_FILE, scope.excludeGlobs, true)
      found.push(
        ...candidates.filter(
          (file) =>
            matchRegex.some((re) => re.test(file)) ||
            (matchGlob ? matchGlob(toPosix(file)) : false),
        ),
      )
    }
    // A scope's ignores apply only to that scope's files, as Playwright scopes them —
    // and `testIgnore` globs match the absolute path, exactly like `testMatch`.
    const ignoreGlob =
      scope.ignoreGlobs.length > 0 ? picomatch(scope.ignoreGlobs, { dot: true }) : null
    matches.push(
      ...found.filter(
        (file) =>
          !ignoreRegex.some((re) => re.test(file)) && !(ignoreGlob?.(toPosix(file)) ?? false),
      ),
    )
  }

  return [...new Set(matches)].sort()
}
