import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import {
  type AnalysisWarning,
  type ConfigDiscovery,
  DEFAULT_DISCOVERY,
  type ParseError,
  type SuiteUsage,
  TAGS_SCHEMA_VERSION,
  type TagUsage,
  type TagsReport,
  type TestPilotConfig,
  buildTagSelection,
  isDirectory,
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

  const warnings: AnalysisWarning[] = []
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
  const declarations: TestDeclaration[] = []
  let tests = 0
  let taggedTests = 0
  let dynamicTitles = 0

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

    for (const declaration of extractTests(program)) {
      declarations.push(declaration)
      tests += 1
      if (declaration.dynamicTitle) {
        dynamicTitles += 1
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
      message: `${dynamicTitles} test(s) build their title from a template literal. Tags inside \`\${...}\` cannot be read statically, so those tests may carry tags not listed here.`,
    })
  }

  const tags: TagUsage[] = [...testsByTag.entries()]
    .map(([tag, count]) => ({ tag, tests: count, files: filesByTag.get(tag)?.size ?? 0 }))
    .sort((a, b) => b.tests - a.tests || a.tag.localeCompare(b.tag))

  const vocabulary = new Set(tags.map((usage) => usage.tag))
  const suites: SuiteUsage[] = Object.keys(options.config.suites)
    .sort()
    .map((name) => {
      const entry = options.config.suites[name] ?? []
      let include: string[] = []
      let exclude: string[] = []
      try {
        const selection = buildTagSelection({ tag: entry })
        include = selection.include
        exclude = selection.exclude
      } catch {
        // Reported by `doctor`; `tags` still lists the suite so it is visible.
      }
      const unknown = unknownSuiteTags(entry, vocabulary)
      const matchingTests =
        unknown.length > 0
          ? null
          : declarations.filter(
              (declaration) =>
                (include.length === 0 ||
                  include.some((tag) => declaration.effectiveTags.includes(tag))) &&
                !exclude.some((tag) => declaration.effectiveTags.includes(tag)),
            ).length
      return { name, include, exclude, unknownTags: unknown, matchingTests }
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
    },
    tags,
    suites,
    warnings,
    parseErrors,
  }
}
