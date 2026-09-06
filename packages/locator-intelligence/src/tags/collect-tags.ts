import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import {
  type ConfigDiscovery,
  DEFAULT_DISCOVERY,
  type ParseError,
  type SuiteUsage,
  TAGS_SCHEMA_VERSION,
  type TagUsage,
  type TagsReport,
  type TagsWarning,
  type TestPilotConfig,
  buildTagSelection,
  isDirectory,
  isEmptySuite,
  parseTagToken,
  selectionInputForSuite,
  splitTagList,
  unknownSuiteTagsDetailed,
} from '@testpilot/core'
import { parseSource } from '../parser.js'
import { type FileScope, discoveryBase, resolveFiles } from '../resolve-files.js'
import { type TestDeclaration, extractTests } from './extract-tests.js'

export interface CollectTagsOptions {
  cwd: string
  config: TestPilotConfig
  patterns?: string[]
  rootDir?: string
  discovery?: ConfigDiscovery
  scopes?: FileScope[]
}

function toPosix(path: string): string {
  return path.split('\\').join('/')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Statically lists the tag vocabulary of a suite.
 *
 * Test files only — page objects and fixtures declare no tests, so
 * `--with-helpers` has nothing to add here.
 */
export async function collectTags(options: CollectTagsOptions): Promise<TagsReport> {
  const usingPatterns = options.patterns !== undefined && options.patterns.length > 0
  const { files } = await resolveFiles({
    cwd: options.cwd,
    patterns: options.patterns,
    config: options.config,
    rootDir: options.rootDir,
    scopes: options.scopes,
  })
  const reportBase = resolve(discoveryBase(options.cwd, options.patterns, options.rootDir))

  const warnings: TagsWarning[] = []
  const parseErrors: ParseError[] = []

  // Explicit patterns bypass `testDir`; see the same guard in `analyze`.
  for (const root of usingPatterns ? [] : (options.discovery?.roots ?? [])) {
    if (!isDirectory(root)) {
      warnings.push({
        code: 'test-root-missing',
        message: `Test directory ${toPosix(relative(reportBase, root)) || root} does not exist, so nothing was scanned under it.`,
      })
    }
  }
  if (options.discovery?.playwrightConfigPartial) {
    const { path, reason } = options.discovery.playwrightConfigPartial
    warnings.push({
      code: 'playwright-config-partial',
      message: `${path} was used for test discovery, but part of it could not be read: ${reason}. The scanned file set may not match what Playwright runs.`,
    })
  }
  if (files.length === 0) {
    warnings.push({
      code: 'no-files-matched',
      message: usingPatterns
        ? `No test files matched ${options.patterns?.join(', ')}.`
        : 'No test files matched, so the tag vocabulary is empty. That is not the same as "this suite has no tags".',
    })
  }

  const testsByTag = new Map<string, number>()
  const filesByTag = new Map<string, Set<string>>()
  const sourcesByTag = new Map<string, Set<'title' | 'details'>>()
  const anchoredTags = new Set<string>()
  const declarations: TestDeclaration[] = []
  let tests = 0
  let taggedTests = 0
  let dynamicTitles = 0
  let unreadableTagExpressions = 0
  let unreadableTitles = 0
  let describesNotInlined = 0
  let filesWithNoTests = 0

  for (const absolute of files) {
    const relativePath = toPosix(relative(reportBase, absolute))
    let code: string
    try {
      code = readFileSync(absolute, 'utf8')
    } catch (error) {
      parseErrors.push({ file: relativePath, message: errorMessage(error) })
      continue
    }
    let program: ReturnType<typeof parseSource>
    try {
      program = parseSource(code, absolute)
    } catch (error) {
      parseErrors.push({ file: relativePath, message: errorMessage(error) })
      continue
    }

    const extracted = extractTests(program)
    unreadableTagExpressions += extracted.unreadableTagExpressions
    describesNotInlined += extracted.describesNotInlined
    // From the extractor, not from the declarations: a describe has no
    // declaration of its own, so deriving these here made its title silent.
    unreadableTitles += extracted.unreadableTitles
    dynamicTitles += extracted.dynamicTitles
    if (extracted.tests.length === 0) {
      filesWithNoTests += 1
    }
    for (const declaration of extracted.tests) {
      declarations.push(declaration)
      tests += 1
      if (declaration.effectiveTags.length > 0) {
        taggedTests += 1
      }
      for (const tag of declaration.effectiveTags) {
        testsByTag.set(tag, (testsByTag.get(tag) ?? 0) + 1)
        const seen = filesByTag.get(tag) ?? new Set<string>()
        seen.add(relativePath)
        filesByTag.set(tag, seen)
      }
      // Provenance is per-declaration: an inherited tag keeps the source it was
      // written with on the describe, which the effective list cannot express.
      for (const tag of declaration.anchoredTags) {
        anchoredTags.add(tag)
      }
      for (const [tag, source] of [
        ...declaration.titleTags.map((tag) => [tag, 'title'] as const),
        ...declaration.detailTags.map((tag) => [tag, 'details'] as const),
      ]) {
        const seen = sourcesByTag.get(tag) ?? new Set<'title' | 'details'>()
        seen.add(source)
        sourcesByTag.set(tag, seen)
      }
    }
  }

  // A file the parser could not read contributes no tests, so the vocabulary is
  // incomplete by exactly that much. Say so rather than presenting a total.
  if (parseErrors.length > 0) {
    warnings.push({
      code: 'files-not-parsed',
      message: `${parseErrors.length} file(s) could not be parsed, so any tags they declare are missing from this vocabulary.`,
    })
  }
  if (dynamicTitles > 0) {
    warnings.push({
      code: 'dynamic-test-titles',
      message: `${dynamicTitles} test(s) build their title from a template literal. Text touching a \`\${...}\` hole is not read, so those tests may carry tags not listed here.`,
    })
  }
  if (unreadableTagExpressions > 0) {
    warnings.push({
      code: 'unreadable-tag-expressions',
      message: `${unreadableTagExpressions} \`tag\` entr(ies) are a spread, a variable, or an interpolated template and could not be read. Each is at least one tag this list does not name.`,
    })
  }
  // Scanned real files and recognized no tests at all: almost always a renamed
  // import (`import { test as setup }`), which the walk keys on by name. Saying
  // "no tags found" there is an answer to a question we never managed to ask.
  // Per file, not per run: a suite where one file uses a renamed import and the
  // rest are normal never tripped the whole-run condition, so the gap was
  // invisible in exactly the mixed case real repos have (Ghost's
  // global.setup.ts, mattermost's test_setup.ts).
  if (filesWithNoTests > 0) {
    warnings.push({
      code: 'no-tests-recognized',
      message: `${filesWithNoTests} file(s) parsed but declared no \`test()\` we recognized — for example a renamed import (\`import { test as setup }\`), or a file whose tests are all commented out. Any tags in those files are missing from this vocabulary.`,
    })
  }
  if (usingPatterns) {
    // The suite lines below make claims about `run --suite X`, which never
    // takes patterns — so a vocabulary read from a deliberately narrowed scan
    // must not be presented as the suite's whole vocabulary.
    warnings.push({
      code: 'scan-restricted-to-patterns',
      message: `Only files matching ${options.patterns?.join(', ')} were scanned, so this is the vocabulary of that subset — not of the whole suite. \`run --suite\` always uses the full suite.`,
    })
  }
  if (options.discovery?.playwrightConfigDeclaresTags) {
    // `testConfig.tag` / `testProject.tag` puts a tag on every test in every
    // file. We do not read the values yet, but claiming a complete vocabulary
    // while one is declared would have `doctor` call a correct suite a typo.
    warnings.push({
      code: 'playwright-config-tags',
      message: `${options.discovery.playwrightConfigPath ?? 'The Playwright config'} declares a \`tag\` key, which Playwright applies to every test. Those tags are not read here, so this vocabulary is incomplete.`,
    })
  }
  if (describesNotInlined > 0) {
    warnings.push({
      code: 'describe-body-not-inlined',
      message: `${describesNotInlined} \`test.describe\` block(s) take their body from a variable or function reference, so the tests inside them — and any tag on the block — could not be read.`,
    })
  }
  if (unreadableTitles > 0) {
    warnings.push({
      code: 'unreadable-test-titles',
      message: `${unreadableTitles} test(s) take their title from a variable or expression, so no tag in the title can be read. Those tests may carry tags not listed here.`,
    })
  }

  const tags: TagUsage[] = [...testsByTag.entries()]
    .map(([tag, count]) => ({
      tag,
      tests: count,
      files: filesByTag.get(tag)?.size ?? 0,
      sources: [...(sourcesByTag.get(tag) ?? [])].sort(),
      selectable: anchoredTags.has(tag) && isSelectableToken(tag),
    }))
    .sort((a, b) => b.tests - a.tests || a.tag.localeCompare(b.tag))

  const unselectable = tags.filter((usage) => !usage.selectable)
  if (unselectable.length > 0) {
    warnings.push({
      code: 'unselectable-tags',
      message: `${unselectable.length} tag(s) cannot be selected with --tag (${unselectable
        .slice(0, 3)
        .map((usage) => `@${usage.tag}`)
        .join(
          ', ',
        )}) — the name contains a comma, reads as a negation, or only ever appears fused to a word. Playwright still treats them as tags; use \`run -- --grep\` for those.`,
    })
  }

  const vocabulary = new Set(tags.map((usage) => usage.tag))
  // Every way the vocabulary is knowingly short of the truth. A suite count
  // computed over it would be a lower bound stated as a fact.
  // `test-root-missing` / `playwright-config-partial` mean whole files were
  // never read at all, which is the largest gap of the lot.
  const INCOMPLETE_CODES = new Set([
    'test-root-missing',
    'playwright-config-partial',
    'no-tests-recognized',
    'describe-body-not-inlined',
    'playwright-config-tags',
    'scan-restricted-to-patterns',
  ])
  const vocabularyComplete =
    unreadableTagExpressions === 0 &&
    unreadableTitles === 0 &&
    dynamicTitles === 0 &&
    parseErrors.length === 0 &&
    !warnings.some((warning) => INCOMPLETE_CODES.has(warning.code))
  const suites: SuiteUsage[] = Object.keys(options.config.suites)
    .sort()
    .map((name) => {
      const entry = options.config.suites[name] ?? []
      let include: string[] = []
      let all: string[] = []
      let exclude: string[] = []
      // An empty suite does not throw — it yields the empty selection, which
      // matches every test. `run` and `doctor` both refuse it, so reporting a
      // healthy count here would have the three commands disagree.
      let malformed = isEmptySuite(entry)
      try {
        const selection = buildTagSelection(selectionInputForSuite(entry))
        include = selection.include
        all = selection.all
        exclude = selection.exclude
      } catch {
        // Reported by `doctor`; `tags` still lists the suite so it is visible.
        // The empty selection left behind would otherwise match every test and
        // print "all tests — N", a confident count for a suite that cannot run.
        malformed = true
      }
      const missing = unknownSuiteTagsDetailed(entry, vocabulary)
      const unknown = missing.include
      const countable = !malformed && unknown.length === 0 && vocabularyComplete
      // Count over `anchoredTags`, not `effectiveTags`: a tag that only appears
      // fused to a word (`user@dual`) is one Playwright reads but our leading
      // boundary deliberately will not, so counting it would promise more tests
      // than `--tag` can actually select.
      const matchingTests = countable
        ? declarations.filter(
            (declaration) =>
              (include.length === 0 ||
                include.some((tag) => declaration.anchoredTags.includes(tag))) &&
              all.every((tag) => declaration.anchoredTags.includes(tag)) &&
              !exclude.some((tag) => declaration.anchoredTags.includes(tag)),
          ).length
        : null
      return {
        name,
        include,
        all,
        exclude,
        unknownTags: unknown,
        unknownExcludedTags: missing.exclude,
        matchingTests,
        malformed,
      }
    })

  return {
    schemaVersion: TAGS_SCHEMA_VERSION,
    command: 'tags',
    rootDir: reportBase,
    discovery: options.discovery ?? DEFAULT_DISCOVERY,
    summary: {
      filesAnalyzed: files.length,
      filesWithParseErrors: parseErrors.length,
      tests,
      taggedTests,
      untaggedTests: tests - taggedTests,
      distinctTags: tags.length,
      dynamicTitles,
      unreadableTagExpressions,
      unreadableTitles,
      describesNotInlined,
      vocabularyComplete,
    },
    tags,
    suites,
    warnings,
    parseErrors,
  }
}

/**
 * True when the tag survives `--tag` parsing unchanged.
 *
 * Catches `@a,@b` (comma-split into two), `@-wip` (the `-` reads as negation
 * and would silently *exclude* `@wip`), and `@a@b` (rejected outright). The
 * other half of selectability — whether the tag ever appears somewhere our
 * leading boundary can reach — is `anchoredTags`.
 */
function isSelectableToken(tag: string): boolean {
  let parsed: ReturnType<typeof parseTagToken>
  try {
    const tokens = splitTagList(tag)
    if (tokens.length !== 1) {
      return false
    }
    parsed = parseTagToken(tokens[0] as string)
  } catch {
    return false
  }
  return !parsed.negated && parsed.name === tag
}
