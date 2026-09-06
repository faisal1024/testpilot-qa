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
  parseTagToken,
  selectionInputForSuite,
  splitTagList,
  unknownSuiteTags,
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
    for (const declaration of extracted.tests) {
      declarations.push(declaration)
      tests += 1
      if (declaration.dynamicTitle) {
        dynamicTitles += 1
      }
      if (!declaration.titleKnown) {
        unreadableTitles += 1
      }
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
  const parsedFiles = files.length - parseErrors.length
  if (parsedFiles > 0 && tests === 0) {
    // Scoped to the files that parsed, so an unrelated parse error elsewhere
    // cannot suppress the disclosure — the previous condition let one broken
    // file hide the fact that nothing was recognized in the others.
    warnings.push({
      code: 'no-tests-recognized',
      message: `${parsedFiles} file(s) parsed but no \`test()\` declarations were recognized. Tests declared through a renamed import (e.g. \`import { test as setup }\`) are not seen, so this vocabulary may be empty for the wrong reason.`,
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
  const vocabularyComplete =
    unreadableTagExpressions === 0 &&
    unreadableTitles === 0 &&
    dynamicTitles === 0 &&
    parseErrors.length === 0
  const suites: SuiteUsage[] = Object.keys(options.config.suites)
    .sort()
    .map((name) => {
      const entry = options.config.suites[name] ?? []
      let include: string[] = []
      let all: string[] = []
      let exclude: string[] = []
      let malformed = false
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
      const unknown = unknownSuiteTags(entry, vocabulary)
      const countable = !malformed && unknown.length === 0 && vocabularyComplete
      const matchingTests = countable
        ? declarations.filter(
            (declaration) =>
              (include.length === 0 ||
                include.some((tag) => declaration.effectiveTags.includes(tag))) &&
              all.every((tag) => declaration.effectiveTags.includes(tag)) &&
              !exclude.some((tag) => declaration.effectiveTags.includes(tag)),
          ).length
        : null
      return { name, include, all, exclude, unknownTags: unknown, matchingTests, malformed }
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
