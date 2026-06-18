import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import {
  ANALYSIS_SCHEMA_VERSION,
  type AnalysisReport,
  type AnalysisWarning,
  type Finding,
  type FindingSeverity,
  type ParseError,
  type TestPilotConfig,
} from '@testpilot/core'
import { extractLocators } from './extractor.js'
import { parseSource } from './parser.js'
import { resolveTestFiles } from './resolve-files.js'
import { builtinRuleIds, builtinRules } from './rules/index.js'
import type { Rule } from './rules/types.js'

export interface AnalyzeOptions {
  /** Directory analysis is relative to (file discovery and reported paths). */
  cwd: string
  /** Loaded TestPilot config (rule severities, include globs, testDir). */
  config: TestPilotConfig
  /** Explicit globs (CLI positional args). Falls back to `config.include`. */
  patterns?: string[]
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
  const files = await resolveTestFiles(options.cwd, options.patterns, options.config)
  const { rules, warnings } = resolveRules(options.config)

  const findings: Finding[] = []
  const parseErrors: ParseError[] = []

  for (const absolute of files) {
    const relativePath = toPosix(relative(options.cwd, absolute))
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

    for (const context of extractLocators(code, program)) {
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

  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    command: 'analyze',
    summary: {
      filesAnalyzed: files.length,
      filesWithParseErrors: parseErrors.length,
      findings: findings.length,
      bySeverity,
    },
    findings,
    warnings,
    parseErrors,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
