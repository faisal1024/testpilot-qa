import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import {
  ANALYSIS_SCHEMA_VERSION,
  type AnalysisReport,
  type AnalysisWarning,
  type ConfigDiscovery,
  DEFAULT_DISCOVERY,
  type Finding,
  type FindingSeverity,
  type ParseError,
  type TestPilotConfig,
  isDirectory,
} from '@testpilot/core'
import { extractLocators } from './extractor.js'
import { parseSource } from './parser.js'
import { type FileScope, discoveryBase, resolveFiles } from './resolve-files.js'
import { allBuiltinRules, builtinRuleIds, builtinRules, builtinTestRules } from './rules/index.js'
import { abstentionFor, requireTestTag } from './rules/require-test-tag.js'
import type { Rule, TestRule } from './rules/types.js'
import { computeScore } from './score.js'
import { extractTests } from './tags/extract-tests.js'

export interface AnalyzeOptions {
  /** Directory analysis is relative to (file discovery and reported paths). */
  cwd: string
  /** Loaded TestPilot config (rule severities, include globs, testDir). */
  config: TestPilotConfig
  /** Explicit globs (CLI positional args). Falls back to `config.include`. */
  patterns?: string[]
  /**
   * Directory that config-driven discovery (`testDir` + `include`) and reported
   * file paths are anchored at — the loaded config file's directory, or the
   * project root when there is no config file. Defaults to `cwd`.
   */
  rootDir?: string
  /** How the files were selected; surfaced verbatim in the report. */
  discovery?: ConfigDiscovery
  /** Directories to scan with their selectors (see `resolveDiscovery`). */
  scopes?: FileScope[]
}

interface EnabledRule {
  rule: Rule
  severity: FindingSeverity
}

interface EnabledTestRule {
  rule: TestRule
  severity: FindingSeverity
}

/** Resolves which rules run and at what severity, plus warnings for unknown ids. */
function resolveRules(config: TestPilotConfig): {
  rules: EnabledRule[]
  testRules: EnabledTestRule[]
  warnings: AnalysisWarning[]
} {
  const warnings: AnalysisWarning[] = []
  for (const id of Object.keys(config.rules)) {
    if (!builtinRuleIds.has(id)) {
      warnings.push({
        code: 'unknown-rule',
        ruleId: id,
        message: `Unknown rule "${id}" in config — ignored.`,
      })
    }
  }
  warnings.sort((a, b) => (a.ruleId ?? '').localeCompare(b.ruleId ?? ''))

  const rules: EnabledRule[] = []
  for (const rule of builtinRules) {
    const override = config.rules[rule.id]
    if (override === 'off' || (rule.defaultOff === true && override === undefined)) {
      continue
    }
    rules.push({ rule, severity: override ?? rule.defaultSeverity })
  }
  const testRules: EnabledTestRule[] = []
  for (const rule of builtinTestRules) {
    const override = config.rules[rule.id]
    // `defaultOff` rules need an explicit opt-in, not merely "not turned off".
    if (override === 'off' || (rule.defaultOff === true && override === undefined)) {
      continue
    }
    testRules.push({ rule, severity: override ?? rule.defaultSeverity })
  }
  return { rules, testRules, warnings }
}

function toPosix(path: string): string {
  return path.split('\\').join('/')
}

function compareFindings(a: Finding, b: Finding): number {
  return (
    a.file.localeCompare(b.file) ||
    a.line - b.line ||
    a.column - b.column ||
    a.ruleId.localeCompare(b.ruleId)
  )
}

/**
 * Runs static locator analysis over the configured files and returns a stable,
 * JSON-serializable report. Deterministic: same inputs → identical output.
 * Parse failures are reported (not thrown) and never fail the command.
 */
export async function analyze(options: AnalyzeOptions): Promise<AnalysisReport> {
  const usingPatterns = options.patterns !== undefined && options.patterns.length > 0
  const { files, helpers, helperCandidatesRejected, helpersNotAnalyzed, helpersNotAnalyzedFiles } =
    await resolveFiles({
      cwd: options.cwd,
      patterns: options.patterns,
      config: options.config,
      rootDir: options.rootDir,
      scopes: options.scopes,
    })
  // Paths are reported relative to the same base discovery used (see discoveryBase).
  // Always absolute: `rootDir` is part of the report contract and consumers
  // re-resolve reported paths from it in a process with a different cwd.
  const reportBase = resolve(discoveryBase(options.cwd, options.patterns, options.rootDir))
  const { rules, testRules, warnings } = resolveRules(options.config)
  // Discovery problems belong in the report, not only on stderr: the HTML report is
  // what gets shared and SARIF is what the gate publishes, and neither should show a
  // confident grade over a config we admit we only half-read.
  if (helpersNotAnalyzed > 0) {
    warnings.push({
      code: 'helpers-not-analyzed',
      message: `${helpersNotAnalyzed} page object/fixture file(s) use Playwright but were not analyzed (${describeFiles(helpersNotAnalyzedFiles, reportBase)}) — Playwright's testMatch does not select them as test files, so this score covers your tests only. Add --with-helpers to include them.`,
    })
  }
  if (helperCandidatesRejected > 0) {
    // Not only when *every* candidate was rejected: a layer where one file is admitted
    // and twenty real ones are dropped is the same blindness, one level down.
    warnings.push({
      code: 'helpers-not-recognized',
      message: `${helperCandidatesRejected} file(s) matched the helper patterns but show no sign of using Playwright, so they were not analyzed. Name your page-object locations in \`includeHelpers\` if this is wrong.`,
    })
  }
  if (options.discovery?.playwrightConfigPartial) {
    const { path, reason } = options.discovery.playwrightConfigPartial
    warnings.push({
      code: 'playwright-config-partial',
      message: `${path} was used for test discovery, but part of it could not be read: ${reason}. The analyzed file set may not match what Playwright runs.`,
    })
  }
  // A declared root that does not exist contributes nothing. Without this, a config
  // naming two roots where one is missing scores a clean grade over half of them.
  // Explicit patterns bypass `testDir` entirely, so warning about it there names a
  // directory this run never consulted — a disclosure about the wrong thing.
  for (const root of usingPatterns ? [] : (options.discovery?.roots ?? [])) {
    if (!isDirectory(root)) {
      warnings.push({
        code: 'test-root-missing',
        message: `Test directory ${toPosix(relative(reportBase, root)) || root} does not exist, so nothing was analyzed under it.`,
      })
    }
  }
  if (options.discovery?.playwrightConfigIgnored) {
    const { path, reason } = options.discovery.playwrightConfigIgnored
    warnings.push({
      code: 'playwright-config-ignored',
      message: `${path} was not used for test discovery: ${reason}.`,
    })
  }
  if (files.length === 0) {
    // A run that matched nothing must never look like a clean pass — a
    // TypeScript-only glob on a JavaScript suite would otherwise score 100/A.
    warnings.push({
      code: 'no-files-matched',
      message: usingPatterns
        ? `No test files matched ${options.patterns?.join(', ')}.`
        : `No test files matched under ${describeScanned(options, reportBase)}.`,
    })
  }

  const findings: Finding[] = []
  const parseErrors: ParseError[] = []
  let callSites = 0
  let testDeclarations = 0
  let unreadableTests = 0
  let configTaggedTests = 0

  for (const absolute of files) {
    const relativePath = toPosix(relative(reportBase, absolute))
    const inHelper = helpers.has(absolute)
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

    const contexts = extractLocators(code, program)
    callSites += contexts.length

    // A second AST pass, so only when a test-level rule is actually enabled.
    // All of them are `off` by default, so an ordinary run pays nothing.
    if (testRules.length > 0) {
      const testContext = {
        playwrightConfigDeclaresTags: options.discovery?.playwrightConfigDeclaresTags === true,
      }
      for (const declaration of extractTests(program).tests) {
        testDeclarations += 1
        const abstention = abstentionFor(declaration, testContext)
        if (abstention === 'unreadable') {
          unreadableTests += 1
        } else if (abstention === 'config-tags') {
          configTaggedTests += 1
        }
        for (const { rule, severity } of testRules) {
          const violation = rule.evaluate(declaration, testContext)
          if (!violation) {
            continue
          }
          findings.push({
            ruleId: rule.id,
            category: rule.category,
            severity,
            message: violation.message,
            file: relativePath,
            ...(inHelper ? { inHelper: true } : {}),
            line: declaration.line,
            column: declaration.column,
            // NOT the title: `findingKey` is (ruleId, file, snippet), so a
            // title-bearing snippet would make renaming an untagged test read
            // as a new finding and fail a `--baseline` gate for a reason
            // unrelated to tagging. Locator rules are immune because their
            // snippet is the locator; this one has to say so explicitly.
            snippet: 'test(…)',
            suggestion: violation.suggestion,
            docsUrl: rule.docsUrl,
          })
        }
      }
    }

    for (const context of contexts) {
      for (const { rule, severity } of rules) {
        const violation = rule.evaluate(context)
        if (!violation) {
          continue
        }
        findings.push({
          ruleId: rule.id,
          category: rule.category,
          severity,
          message: violation.message,
          file: relativePath,
          ...(inHelper ? { inHelper: true } : {}),
          line: context.line,
          column: context.column,
          snippet: context.raw,
          suggestion: violation.suggestion,
          docsUrl: rule.docsUrl,
        })
      }
    }
  }

  // One line a reader can act on, instead of N interleaved `info` lines they
  // cannot triage — and it reconciles against `testpilot tags`, which counts
  // every untagged test including the ones this rule abstains on.
  if (testRules.length > 0 && testDeclarations > 0) {
    warnings.push(
      ...tagCoverageWarning(findings, testDeclarations, unreadableTests, configTaggedTests),
    )
  }

  findings.sort(compareFindings)
  parseErrors.sort((a, b) => a.file.localeCompare(b.file))

  const bySeverity: Record<FindingSeverity, number> = { info: 0, warn: 0, error: 0 }
  for (const finding of findings) {
    bySeverity[finding.severity] += 1
  }

  // Some findings are counted but NOT scored — see `RuleMeta.scored`. Keyed on
  // the rule's own declaration rather than on its kind, so a later test-level
  // rule that *does* belong in the score is not blocked by the abstraction.
  // Excluding them silently would be its own dishonesty, so the exclusion is
  // named in the report and in every human-facing output.
  const unscoredRuleIds = new Set(
    allBuiltinRules.filter((rule) => rule.scored === false).map((rule) => rule.id),
  )
  const scoredFindings = findings.filter((finding) => !unscoredRuleIds.has(finding.ruleId))
  const score = computeScore(scoredFindings, callSites, options.config.scoring.weights)

  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    command: 'analyze',
    rootDir: reportBase,
    discovery: options.discovery ?? DEFAULT_DISCOVERY,
    summary: {
      filesAnalyzed: files.length,
      helperFiles: helpers.size,
      helpersNotAnalyzed,
      filesWithParseErrors: parseErrors.length,
      findings: findings.length,
      unscoredFindings: findings.length - scoredFindings.length,
      unscoredRuleIds: [...unscoredRuleIds].filter((id) =>
        findings.some((finding) => finding.ruleId === id),
      ),
      bySeverity,
    },
    score,
    findings,
    warnings,
    parseErrors,
  }
}

/** A count nobody can check is a number to be trusted; name enough of it to dispute. */
function describeFiles(files: string[], base: string): string {
  const shown = files.slice(0, 3).map((file) => toPosix(relative(base, file)))
  const rest = files.length - shown.length
  return rest > 0 ? `${shown.join(', ')}, and ${rest} more` : shown.join(', ')
}

/** Names what was actually scanned — never `config.testDir`, which discovery may not have used. */
function describeScanned(options: AnalyzeOptions, base: string): string {
  const roots = options.discovery?.roots ?? []
  const selectors = [
    ...new Set(
      (options.scopes ?? []).flatMap((scope) => [...scope.includeGlobs, ...scope.matchGlobs]),
    ),
    ...new Set(
      (options.scopes ?? []).flatMap((scope) =>
        scope.matchRegex.map((pattern) => `/${pattern.source}/${pattern.flags}`),
      ),
    ),
  ]
  const where =
    roots.length > 0
      ? roots.map((root) => toPosix(relative(base, root)) || '.').join(', ')
      : `testDir "${options.config.testDir}"`
  const include = selectors.length > 0 ? selectors : options.config.include
  return `${where} (include ${JSON.stringify(include)})`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * One-line `require-test-tag` rollup.
 *
 * The abstention *reason* is carried through, because "we could not read it"
 * and "the config tags everything" are different facts and reporting the first
 * for the second would be a false explanation of a correct answer.
 */
function tagCoverageWarning(
  findings: Finding[],
  declarations: number,
  unreadable: number,
  configTagged: number,
): AnalysisWarning[] {
  if (configTagged > 0) {
    return [
      {
        code: 'test-tag-coverage',
        message: `${requireTestTag.id} found nothing to flag: the Playwright config declares a \`tag\`, which applies to every test in every file, so no test in this suite is untagged.`,
      },
    ]
  }
  const flagged = findings.filter((finding) => finding.ruleId === requireTestTag.id).length
  if (flagged === 0 && unreadable === 0) {
    return []
  }
  const judged = declarations - unreadable
  // Floor, not round: "100% tagged" printed beside a non-zero flagged count is
  // exactly the kind of reassuring wrong number a team would gate on.
  const coverage = judged > 0 ? Math.floor(((judged - flagged) / judged) * 100) : 100
  return [
    {
      code: 'test-tag-coverage',
      message: `${requireTestTag.id}: ${flagged} of ${judged} readable test declaration(s) carry no tag \`--tag\` can select (${coverage}% tagged)${
        unreadable > 0
          ? `; a further ${unreadable} could not be judged — a title or \`tag\` entry, theirs or an enclosing describe's, is not statically readable, so they are neither flagged here nor counted as tagged.`
          : '.'
      }`,
    },
  ]
}
