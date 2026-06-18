import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import {
  ANALYSIS_SCHEMA_VERSION,
  type AnalysisReport,
  type Finding,
  type FindingSeverity,
  type TestPilotConfig,
} from '@testpilot/core'
import { extractLocators } from './extractor.js'
import { parseSource } from './parser.js'
import { resolveTestFiles } from './resolve-files.js'
import { builtinRules } from './rules/index.js'
import type { Rule } from './rules/types.js'

export interface AnalyzeOptions {
  /** Directory analysis is relative to (file discovery and reported paths). */
  cwd: string
  /** Loaded TestPilot config (rule severities, include globs, testDir). */
  config: TestPilotConfig
  /** Explicit globs (CLI positional args). Falls back to `config.include`. */
  patterns?: string[]
  /** Notified (instead of throwing) when a file cannot be parsed. */
  onParseError?: (file: string, error: unknown) => void
}

interface EnabledRule {
  rule: Rule
  severity: FindingSeverity
}

/** Resolves which rules run and at what severity, honoring config overrides and `off`. */
function enabledRules(config: TestPilotConfig): EnabledRule[] {
  const enabled: EnabledRule[] = []
  for (const rule of builtinRules) {
    const override = config.rules[rule.id]
    if (override === 'off') {
      continue
    }
    enabled.push({ rule, severity: override ?? rule.defaultSeverity })
  }
  return enabled
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
 */
export async function analyze(options: AnalyzeOptions): Promise<AnalysisReport> {
  const files = await resolveTestFiles(options.cwd, options.patterns, options.config)
  const rules = enabledRules(options.config)
  const findings: Finding[] = []

  for (const absolute of files) {
    const relativePath = toPosix(relative(options.cwd, absolute))
    let code: string
    try {
      code = readFileSync(absolute, 'utf8')
    } catch (error) {
      options.onParseError?.(relativePath, error)
      continue
    }

    let program: ReturnType<typeof parseSource>
    try {
      program = parseSource(code, absolute)
    } catch (error) {
      options.onParseError?.(relativePath, error)
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

  const bySeverity: Record<FindingSeverity, number> = { info: 0, warn: 0, error: 0 }
  for (const finding of findings) {
    bySeverity[finding.severity] += 1
  }

  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    command: 'analyze',
    summary: {
      filesAnalyzed: files.length,
      findings: findings.length,
      bySeverity,
    },
    findings,
  }
}
