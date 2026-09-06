import { closeSync, openSync, readSync, realpathSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import {
  DEFAULT_HELPER_PATTERNS,
  type DiscoveryScope,
  type RegexPattern,
  type TestPilotConfig,
  isDirectory,
} from '@testpilot/core'
import picomatch from 'picomatch'
import { glob } from 'tinyglobby'

const toPosix = (path: string): string => path.split('\\').join('/')

/**
 * Evidence that a file is part of the Playwright suite rather than application code
 * that happens to sit in a directory with a suggestive name. Read once, cheaply, and
 * only for helper candidates.
 *
 * The bar is "contains something the extractor extracts", but two of those methods are
 * not Playwright's alone. `getBy*` and `nth` are Testing Library's too, and admitting
 * an RTL helper is not harmless: it produces no findings while adding call sites, and
 * call sites are the score's denominator — enough to move a failing `--min-score` gate
 * to passing. So the shared methods count as evidence only when nothing in the file
 * claims them for Testing Library.
 *
 * Nothing here may key on a receiver named `page`: page objects hold the handle as
 * `this._page`, `this.root` or `adminPage` at least as often, and the extractor matches
 * by method name on any receiver.
 */
const PLAYWRIGHT_UNIQUE =
  /from\s+['"]@playwright\/test['"]|require\(['"]@playwright\/test['"]\)|\bLocator\b|\.\s*(locator|frameLocator|waitForTimeout)\s*\(/

/** Extracted, but shared with Testing Library — evidence only in its owner's absence. */
const SHARED_WITH_TESTING_LIBRARY =
  /\.\s*(getBy(Role|Text|Label|Placeholder|AltText|Title|TestId)|nth)\s*\(/

const TESTING_LIBRARY = /@testing-library\/|\bscreen\s*\.\s*getBy/

function realpathOrNull(path: string): string | null {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}

/**
 * Keeps a symlinked helper directory from taking analysis (and `fix --write`) outside.
 * `base` is resolved once by the caller: doing it per file cost 800ms on a 30k-candidate
 * tree.
 */
function withinRoot(file: string, base: string): boolean {
  const real = realpathOrNull(file)
  return real !== null && (real === base || real.startsWith(`${base}${sep}`))
}

/** Every signal is an import or a call that appears early in a file, or not at all. */
const SNIFF_BYTES = 64 * 1024

function usesPlaywright(file: string): boolean {
  let handle: number | undefined
  try {
    handle = openSync(file, 'r')
    const buffer = Buffer.alloc(SNIFF_BYTES)
    const read = readSync(handle, buffer, 0, SNIFF_BYTES, 0)
    const code = buffer.toString('utf8', 0, read)
    if (PLAYWRIGHT_UNIQUE.test(code)) return true
    return SHARED_WITH_TESTING_LIBRARY.test(code) && !TESTING_LIBRARY.test(code)
  } catch {
    return false
  } finally {
    if (handle !== undefined) closeSync(handle)
  }
}

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
/** Discovered files, split by whether they are the suite's own or its helper layer. */
export interface ResolvedFiles {
  files: string[]
  /**
   * Page-object / fixture files that exist and use Playwright but were **not**
   * analyzed, because helper analysis was not asked for. Reported, because most
   * suites keep most of their locators there: on Ghost it is 673 of 768 call sites,
   * and a score that omits them silently is a score of the wrong thing.
   */
  helpersNotAnalyzed: number
  /** The paths behind that count, so the number can be checked rather than trusted. */
  helpersNotAnalyzedFiles: string[]
  /** Absolute paths within `files` that came from `helperGlobs`. */
  helpers: Set<string>
  /**
   * Files that matched `helperGlobs` but were not admitted — they carry no sign of
   * using Playwright. Reported, because a helper layer matched and then silently
   * discarded is indistinguishable from one that does not exist.
   */
  helperCandidatesRejected: number
}

export async function resolveTestFiles(options: ResolveFilesOptions): Promise<string[]> {
  return (await resolveFiles(options)).files
}

/**
 * Like {@link resolveTestFiles}, but keeps the helper/page-object files distinguishable.
 * Playwright never runs those, so their findings are real but belong in a different
 * bucket from the suite's own.
 */
export async function resolveFiles(options: ResolveFilesOptions): Promise<ResolvedFiles> {
  const { cwd, patterns, config } = options
  const usingPatterns = patterns !== undefined && patterns.length > 0

  // `ALWAYS_IGNORED` is unconditional: `exclude` replaces its default when the user
  // sets it, and nothing — least of all `fix --write` — may touch dependency code.
  const run = async (base: string, globs: string[], ignore: string[], dot = false) => {
    if (globs.length === 0) return []
    return glob(globs, { cwd: base, absolute: true, dot, ignore: [...ALWAYS_IGNORED, ...ignore] })
  }

  if (usingPatterns) {
    const { literal, expanded } = splitPatterns(cwd, patterns, config.include)
    const matched = [
      ...(await run(cwd, literal, [])),
      ...(await run(cwd, expanded, config.exclude)),
    ]
    return {
      files: [...new Set(matched)].sort(),
      helpers: new Set(),
      helperCandidatesRejected: 0,
      helpersNotAnalyzed: 0,
      helpersNotAnalyzedFiles: [],
    }
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
          helperGlobs: [],
          helperRoot: resolve(discoveryBase(cwd, patterns, options.rootDir)),
          ignoreGlobs: [],
          ignoreRegex: [],
        },
      ]

  // --- The suite's own files: what Playwright would run. ---
  const tests: string[] = []
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
    tests.push(
      ...found.filter(
        (file) =>
          !ignoreRegex.some((re) => re.test(file)) && !(ignoreGlob?.(toPosix(file)) ?? false),
      ),
    )
  }
  const testFiles = new Set(tests)

  // --- The helper layer: page objects and fixtures Playwright never runs. ---
  // Scanned once, not per scope: `helperGlobs`/`helperRoot` are the same in every scope
  // of a config, so a five-project repo was walking the same tree five times.
  //
  // Only when the suite itself was found. Otherwise a wrong `testDir` would stop being
  // a hard failure and start scoring the helper layer alone — turning the red gate #71
  // exists for back into a green one.
  const helpers = new Set<string>()
  let helperCandidatesRejected = 0
  let helpersNotAnalyzed = 0
  const helpersNotAnalyzedFiles: string[] = []
  const helperScope = scopes.find((scope) => scope.helperGlobs.length > 0)

  const probeScope = helperScope ?? scopes[0]
  if (probeScope && testFiles.size > 0) {
    // One pass over the union of what the user asked for and where page objects
    // conventionally live. A narrowed `includeHelpers` must not silence the
    // disclosure — that made the report claim coverage it did not have, which is
    // worse than the silence this warning exists to end.
    const analysing = helperScope !== undefined
    const analysed = picomatch(helperScope?.helperGlobs ?? [], { dot: true })
    const anyHelper = picomatch(
      [...new Set([...DEFAULT_HELPER_PATTERNS, ...(helperScope?.helperGlobs ?? [])])],
      { dot: true },
    )
    // No `dot: true` on the walk: the patterns have no dotted segment, so it only
    // reaches editor history and cache copies (`.history/`, `.cache/`) and inflates
    // the very count this warning is asking to be trusted.
    const candidates = await run(probeScope.helperRoot, ANY_SOURCE_FILE, probeScope.excludeGlobs)
    const projectRoot = realpathOrNull(probeScope.helperRoot)
    for (const file of candidates) {
      // Membership as a test always wins: a spec that happens to live under
      // `fixtures/` is still a test, and demoting its findings would hide them.
      if (testFiles.has(file) || !anyHelper(toPosix(file))) continue
      // A symlink can point anywhere; `fix --write` follows it. The helper scan
      // widened the root from `testDir` to the whole project, so this is the one
      // remaining route out of the checkout.
      if (!projectRoot || !withinRoot(file, projectRoot)) {
        if (analysing) helperCandidatesRejected += 1
        continue
      }
      // Directory names alone are not evidence: `pages/` is Next.js's routes and
      // `helpers/` is Ember's. A page object is a file that actually uses Playwright.
      if (!usesPlaywright(file)) {
        if (analysing && analysed(toPosix(file))) helperCandidatesRejected += 1
        continue
      }
      if (analysing && analysed(toPosix(file))) helpers.add(file)
      else {
        helpersNotAnalyzed += 1
        helpersNotAnalyzedFiles.push(file)
      }
    }
  }

  return {
    files: [...testFiles, ...helpers].sort(),
    helpers,
    helperCandidatesRejected,
    helpersNotAnalyzed,
    helpersNotAnalyzedFiles: helpersNotAnalyzedFiles.sort(),
  }
}
