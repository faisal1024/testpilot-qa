import { isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  type AnalysisReport,
  type Finding,
  type FindingSeverity,
  findingKey,
} from '@testpilot/core'
import { CLI_VERSION } from '../version.js'

/**
 * Minimal SARIF 2.1.0 shape — just the parts TestPilot emits. Typed locally so
 * the reporter stays self-contained and the output is easy to reason about.
 * Spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 */
export interface SarifLog {
  $schema: string
  version: '2.1.0'
  runs: SarifRun[]
}

interface SarifRun {
  tool: { driver: SarifDriver }
  results: SarifResult[]
}

interface SarifDriver {
  name: string
  informationUri: string
  version: string
  rules: SarifReportingDescriptor[]
}

interface SarifReportingDescriptor {
  id: string
  name: string
  shortDescription: { text: string }
  fullDescription?: { text: string }
  helpUri?: string
  defaultConfiguration: { level: SarifLevel }
}

type SarifLevel = 'error' | 'warning' | 'note'

interface SarifResult {
  ruleId: string
  ruleIndex: number
  level: SarifLevel
  message: { text: string }
  locations: SarifLocation[]
  partialFingerprints: Record<string, string>
}

interface SarifLocation {
  physicalLocation: {
    artifactLocation: { uri: string }
    region: {
      startLine: number
      startColumn: number
      snippet: { text: string }
    }
  }
}

const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json'
const INFORMATION_URI = 'https://github.com/faisal1024/testpilot-qa'

/** SARIF severity levels: `error` blocks, `warning` and `note` annotate. */
function toLevel(severity: FindingSeverity): SarifLevel {
  if (severity === 'error') return 'error'
  if (severity === 'warn') return 'warning'
  return 'note'
}

/**
 * Converts an analysis report to a SARIF 2.1.0 log so findings surface as
 * GitHub code-scanning annotations on the exact file and line. Pure — no I/O.
 *
 * Each distinct `ruleId` becomes a reporting descriptor (carrying its help URL
 * and default level); each finding becomes a result located at its file/line.
 * `partialFingerprints` use the same stable identity as the baseline, so a
 * finding that merely moves lines is not re-reported as new by code scanning.
 */
export interface SarifOptions {
  /**
   * Directory SARIF `artifactLocation.uri`s are made relative to (the Action runs
   * from the repo root, so this keeps code-scanning annotations on the right
   * files). Defaults to `report.rootDir`, i.e. the paths as reported.
   */
  cwd?: string
}

function artifactUri(report: AnalysisReport, file: string, cwd: string | undefined): string {
  const absolute = report.rootDir ? resolve(report.rootDir, file) : file
  // A file outside the project itself (a Playwright `testDir: '../shared'`) has no
  // valid checkout-relative URI; code scanning rejects one and drops the upload. An
  // absolute file URI is at least well-formed. A path that merely escapes `--cwd`
  // (running from a sub-directory) is fine and stays relative, as documented.
  if (file.startsWith('..') || isAbsolute(file)) {
    return pathToFileURL(absolute).href
  }
  return cwd ? relative(cwd, absolute).split(sep).join('/') || file : file
}

export function toSarif(report: AnalysisReport, options: SarifOptions = {}): SarifLog {
  const ruleIndex = new Map<string, number>()
  const rules: SarifReportingDescriptor[] = []
  const results: SarifResult[] = []

  for (const finding of report.findings) {
    let index = ruleIndex.get(finding.ruleId)
    if (index === undefined) {
      index = rules.length
      ruleIndex.set(finding.ruleId, index)
      rules.push(ruleDescriptor(finding))
    }
    results.push({
      ruleId: finding.ruleId,
      ruleIndex: index,
      level: toLevel(finding.severity),
      message: { text: finding.message },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: artifactUri(report, finding.file, options.cwd) },
            region: {
              startLine: finding.line,
              startColumn: finding.column,
              snippet: { text: finding.snippet },
            },
          },
        },
      ],
      partialFingerprints: { 'testpilotIdentity/v1': findingKey(finding) },
    })
  }

  return {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [{ tool: { driver: driver(rules) }, results }],
  }
}

function driver(rules: SarifReportingDescriptor[]): SarifDriver {
  return {
    name: 'TestPilot QA',
    informationUri: INFORMATION_URI,
    version: CLI_VERSION,
    rules,
  }
}

function ruleDescriptor(finding: Finding): SarifReportingDescriptor {
  return {
    id: finding.ruleId,
    name: finding.ruleId,
    shortDescription: { text: finding.message },
    ...(finding.suggestion ? { fullDescription: { text: finding.suggestion } } : {}),
    ...(finding.docsUrl ? { helpUri: finding.docsUrl } : {}),
    defaultConfiguration: { level: toLevel(finding.severity) },
  }
}
