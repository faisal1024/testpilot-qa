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
} from '@testpilot/core'
import { extractLocators } from './extractor.js'
import { parseSource } from './parser.js'
import { discoveryBase, resolveTestFiles } from './resolve-files.js'
import { builtinRuleIds, builtinRules } from './rules/index.js'
import type { Rule } from './rules/types.js'
import { computeScore } from './score.js'

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
  /** Absolute test roots (Playwright suites can declare several via `projects[]`). */
  roots?: string[]
  /** Playwright RegExp `testMatch` sources. */
  matchRegex?: string[]
  /** Playwright RegExp `testIgnore` sources. */
  ignoreRegex?: string[]
}

interface EnabledRule {
  rule: Rule
  severity: FindingSeverity
}

/** Resolves which rules run and at what severity, plus warnings for unknown ids. */
function resolveRules(config: TestPilotConfig): {
  rules: EnabledRule[]
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
    if (override === 'off') {
      continue
    }
    rules.push({ rule, severity: override ?? rule.defaultSeverity })
  }
  return { rules, warnings }
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
  const files = await resolveTestFiles({
    cwd: options.cwd,
    patterns: options.patterns,
    config: options.config,
    rootDir: options.rootDir,
    roots: options.roots,
    matchRegex: options.matchRegex,
    ignoreRegex: options.ignoreRegex,
  })
  // Paths are reported relative to the same base discovery used (see discoveryBase).
  // Always absolute: `rootDir` is part of the report contract and consumers
  // re-resolve reported paths from it in a process with a different cwd.
  const reportBase = resolve(discoveryBase(options.cwd, options.patterns, options.rootDir))
  const { rules, warnings } = resolveRules(options.config)
  if (files.length === 0) {
    // A run that matched nothing must never look like a clean pass — a
    // TypeScript-only glob on a JavaScript suite would otherwise score 100/A.
    warnings.push({
      code: 'no-files-matched',
      message: usingPatterns
        ? `No test files matched ${options.patterns?.join(', ')}.`
        : `No test files matched include ${JSON.stringify(options.config.include)} (exclude ${JSON.stringify(options.config.exclude)}) under testDir "${options.config.testDir}".`,
    })
  }

  const findings: Finding[] = []
  const parseErrors: ParseError[] = []
  let callSites = 0

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

    const contexts = extractLocators(code, program)
    callSites += contexts.length

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
          line: context.line,
          column: context.column,
          snippet: context.raw,
          suggestion: violation.suggestion,
          docsUrl: rule.docsUrl,
        })
      }
    }
  }

  findings.sort(compareFindings)
  parseErrors.sort((a, b) => a.file.localeCompare(b.file))

  const bySeverity: Record<FindingSeverity, number> = { info: 0, warn: 0, error: 0 }
  for (const finding of findings) {
    bySeverity[finding.severity] += 1
  }

  // Parse errors are reported but do not penalize the score in this milestone.
  const score = computeScore(findings, callSites, options.config.scoring.weights)

  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    command: 'analyze',
    rootDir: reportBase,
    discovery: options.discovery ?? DEFAULT_DISCOVERY,
    summary: {
      filesAnalyzed: files.length,
      filesWithParseErrors: parseErrors.length,
      findings: findings.length,
      bySeverity,
    },
    score,
    findings,
    warnings,
    parseErrors,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
