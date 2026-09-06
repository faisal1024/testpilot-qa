import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  AGENT_FILE_PATHS,
  type AgentGuidanceStatus,
  type AgentId,
  GUIDANCE_VERSION,
  type GuidanceFileState,
  classifyGuidanceFile,
  selectedAgents,
} from '@testpilot/ai'
import { type ConfigDiscovery, DEFAULT_DISCOVERY } from '../config/discovery.js'
import { ConfigError } from '../config/errors.js'
import { loadConfig } from '../config/load-config.js'
import {
  describeRoots,
  findPlaywrightConfigNearby,
  resolveDiscovery,
} from '../config/resolve-discovery.js'
import { type TestPilotConfig, defaultConfig } from '../config/schema.js'
import { findProjectRoot, isDirectory, resolvePlaywrightBin } from '../project/discovery.js'
import type { SuiteMap } from '../tags/suites.js'
import { unknownSuiteTags, validateSuites } from '../tags/validate-suites.js'

/**
 * Bumped on changes to the doctor report shape.
 * 1.1: `checks` is variable-length — `ai-guidance` is omitted on a project without a
 * `testpilot.config.ts` (unless `--strict-guidance`), `test-directory`/`include-globs`
 * are omitted when the config failed to load, and `playwright-discovery` appears only
 * when a Playwright config was partially read or could not be used. `test-directory`
 * gained `details`.
 * 1.2: `suites` — a new conditional check, present only when `testpilot.config.ts`
 * declares a non-empty `suites` map and the config loaded. Carries `details.issues`
 * (structural problems) or `details.unknownTags` (suite name -> tags no test carries).
 */
export const DOCTOR_SCHEMA_VERSION = '1.2'

const MIN_NODE_MAJOR = 20

export type CheckStatus = 'pass' | 'warn' | 'fail'

/** Which area a check belongs to — drives the CLI exit code (config → 3, others → 4). */
export type DoctorCategory = 'environment' | 'config' | 'project'

export interface DoctorCheck {
  id: string
  title: string
  category: DoctorCategory
  status: CheckStatus
  message: string
  remediation?: string
  /** Optional structured detail (e.g. per-file AI guidance status). Backwards-compatible. */
  details?: Record<string, unknown>
}

export interface DoctorReport {
  schemaVersion: string
  command: 'doctor'
  /** Worst check status: `fail` if any failed, else `warn` if any warned, else `pass`. */
  status: CheckStatus
  checks: DoctorCheck[]
  /** Deduped remediations from non-passing checks, in check order. */
  nextActions: string[]
}

export interface DoctorOptions {
  cwd: string
  configPath?: string
  /**
   * Resolves the tag vocabulary of the suite, for validating `suites`.
   *
   * Injected rather than imported: reading it needs the AST parser, which lives
   * downstream of core. Returning `null` means "could not be determined" — the
   * check then says so instead of silently reporting every tag as valid.
   */
  tagVocabulary?: () => Promise<ReadonlySet<string> | null>
  /** Skip the Playwright-config fallback, so `doctor` matches `--no-playwright-discovery`. */
  disablePlaywrightFallback?: boolean
  /**
   * Check AI guidance files even when the project has no `testpilot.config.ts`.
   * Off by default: `doctor` is useful on a repo you're only evaluating, and
   * "you're missing CLAUDE.md" is noise there.
   */
  strictGuidance?: boolean
  /** Override Node version (defaults to the running Node). Injectable for tests. */
  nodeVersion?: string
}

function checkNodeVersion(version: string): DoctorCheck {
  const major = Number.parseInt(version.replace(/^v/, '').split('.')[0] ?? '', 10)
  if (Number.isFinite(major) && major >= MIN_NODE_MAJOR) {
    return {
      id: 'node-version',
      title: 'Node.js version',
      category: 'environment',
      status: 'pass',
      message: `Node ${version} satisfies the minimum (v${MIN_NODE_MAJOR}).`,
    }
  }
  return {
    id: 'node-version',
    title: 'Node.js version',
    category: 'environment',
    status: 'fail',
    message: `Node ${version} is below the required v${MIN_NODE_MAJOR}.`,
    remediation: `Upgrade to Node ${MIN_NODE_MAJOR} or newer.`,
  }
}

function checkPackageJson(projectRoot: string, present: boolean): DoctorCheck {
  return present
    ? {
        id: 'package-json',
        title: 'package.json',
        category: 'project',
        status: 'pass',
        message: `Found package.json in ${projectRoot}.`,
      }
    : {
        id: 'package-json',
        title: 'package.json',
        category: 'project',
        status: 'fail',
        message: 'No package.json found in this directory or any parent.',
        remediation: 'Run inside a Node project, or create one with `npm init`.',
      }
}

function checkPlaywrightInstalled(binPath: string | null): DoctorCheck {
  return binPath
    ? {
        id: 'playwright-installed',
        title: 'Playwright installed',
        category: 'environment',
        status: 'pass',
        message: 'Local Playwright binary found in node_modules.',
      }
    : {
        id: 'playwright-installed',
        title: 'Playwright installed',
        category: 'environment',
        status: 'fail',
        message: 'Playwright is not installed locally.',
        remediation: 'Add it (`npm install -D @playwright/test`) and run `npm install`.',
      }
}

function checkPlaywrightConfig(configPath: string | null, ambiguous: string[] = []): DoctorCheck {
  // "No Playwright config found — add one" is nonsense on a repo that has two.
  if (!configPath && ambiguous.length > 0) {
    return {
      id: 'playwright-config',
      title: 'Playwright config',
      category: 'project',
      status: 'warn',
      message: `Several Playwright configs found: ${ambiguous.join(', ')}.`,
      remediation:
        'Set `playwrightConfig` in testpilot.config.ts to pick one, or set `testDir` explicitly.',
      details: { candidates: ambiguous },
    }
  }
  return configPath
    ? {
        id: 'playwright-config',
        title: 'Playwright config',
        category: 'project',
        status: 'pass',
        message: `Playwright config found: ${configPath}.`,
      }
    : {
        id: 'playwright-config',
        title: 'Playwright config',
        category: 'project',
        status: 'warn',
        message: 'No Playwright config found.',
        remediation: 'Add playwright.config.ts (Playwright otherwise uses built-in defaults).',
      }
}

function checkTestDirectory(
  missingRoots: string[],
  discovery: ConfigDiscovery,
  rootDir: string,
): DoctorCheck {
  // Always name what discovery actually resolved. `config.testDir` is not it when
  // the Playwright config supplied the roots, or when there are several. Only the
  // directories that are actually missing are named as missing.
  const testDir = describeRoots(discovery.roots, rootDir)
  const missing = describeRoots(missingRoots, rootDir)
  const exists = discovery.roots.length > 0 && missingRoots.length === 0
  // Naming the source turns "was not found" from a puzzle into an instruction.
  const source =
    discovery.testDir === 'playwright-config'
      ? ` (from ${discovery.playwrightConfigPath})`
      : discovery.testDir === 'default'
        ? ' (built-in default)'
        : ''
  return exists
    ? {
        id: 'test-directory',
        title: 'Test directory',
        category: 'project',
        status: 'pass',
        message: `Test directory "${testDir}"${source} exists.`,
        details: { testDir, source: discovery.testDir },
      }
    : {
        id: 'test-directory',
        title: 'Test directory',
        category: 'project',
        status: 'warn',
        message:
          discovery.roots.length === 0
            ? 'No test directory could be resolved.'
            : `Test director${missingRoots.length === 1 ? 'y' : 'ies'} "${missing}"${source} ${missingRoots.length === 1 ? 'was' : 'were'} not found.`,
        remediation:
          discovery.testDir === 'default'
            ? 'Set `testDir` in testpilot.config.ts (or add a Playwright config), or scaffold with `testpilot init`.'
            : 'Create it, or point `testDir` at your suite.',
        details: { testDir, missing: missingRoots, source: discovery.testDir },
      }
}

/**
 * Surfaced only when a Playwright config was found but could not be used for
 * discovery — otherwise the user is left wondering why their suite is invisible.
 */
function checkPlaywrightDiscovery(discovery: ConfigDiscovery): DoctorCheck {
  // "Was not used" and "was used, but part of it was unreadable" are different
  // problems; conflating them sends the user to fix one they don't have.
  const partial = discovery.playwrightConfigPartial
  const ignored = discovery.playwrightConfigIgnored
  const detail = partial ?? ignored
  return {
    id: 'playwright-discovery',
    title: 'Playwright config discovery',
    category: 'config',
    status: 'warn',
    message: partial
      ? `${partial.path} was used for test discovery, but part of it could not be read: ${partial.reason}.`
      : `${ignored?.path} was not used for test discovery: ${ignored?.reason}.`,
    remediation: partial
      ? 'Set `testDir`/`include` explicitly in testpilot.config.ts if the discovered file set is wrong — TestPilot reads the Playwright config statically and cannot evaluate computed values.'
      : 'Set `testDir` (and `include`) explicitly in testpilot.config.ts — TestPilot reads the Playwright config statically and cannot evaluate computed values.',
    details: {
      playwrightConfigPath: detail?.path,
      reason: detail?.reason,
      partial: Boolean(partial),
    },
  }
}

function checkIncludeGlobs(include: string[], discovery: ConfigDiscovery): DoctorCheck {
  // When Playwright supplied the selectors, `config.include` is not what runs.
  if (discovery.include === 'playwright-config' || discovery.include === 'mixed') {
    return {
      id: 'include-globs',
      title: 'Include patterns',
      category: 'config',
      status: 'pass',
      message:
        discovery.include === 'mixed'
          ? `Test selection comes partly from ${discovery.playwrightConfigPath}.`
          : `Test selection comes from ${discovery.playwrightConfigPath}.`,
    }
  }
  const usable =
    Array.isArray(include) &&
    include.length > 0 &&
    include.every((pattern) => typeof pattern === 'string' && pattern.trim().length > 0)
  return usable
    ? {
        id: 'include-globs',
        title: 'Include patterns',
        category: 'config',
        status: 'pass',
        message: `${include.length} include pattern(s) configured.`,
      }
    : {
        id: 'include-globs',
        title: 'Include patterns',
        category: 'config',
        status: 'warn',
        message: 'No usable include patterns are configured.',
        remediation: 'Set a non-empty `include` array in testpilot.config.ts.',
      }
}

function checkProjectStructure(
  managed: boolean,
  hasPlaywrightConfig: boolean,
  hasTestDir: boolean,
): DoctorCheck {
  if (!managed) {
    return {
      id: 'project-structure',
      title: 'Project structure',
      category: 'project',
      status: 'pass',
      message: 'Not a TestPilot-scaffolded project — structure check skipped.',
    }
  }
  return hasPlaywrightConfig && hasTestDir
    ? {
        id: 'project-structure',
        title: 'Project structure',
        category: 'project',
        status: 'pass',
        message: 'TestPilot project structure looks complete.',
      }
    : {
        id: 'project-structure',
        title: 'Project structure',
        category: 'project',
        status: 'warn',
        message: 'TestPilot project is missing playwright.config.ts or the test directory.',
        remediation: 'Re-scaffold with `testpilot init`, or add the missing files.',
      }
}

function readFileOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

const STATE_LABEL: Record<Exclude<GuidanceFileState, 'current'>, string> = {
  missing: 'missing',
  edited: 'user-edited',
  stale: 'stale',
  'no-marker': 'unmarked',
}

function describeIssues(issues: AgentGuidanceStatus[]): string {
  const order: Array<Exclude<GuidanceFileState, 'current'>> = [
    'missing',
    'edited',
    'stale',
    'no-marker',
  ]
  return order
    .map((state) => {
      const paths = issues.filter((issue) => issue.state === state).map((issue) => issue.path)
      return paths.length > 0 ? `${paths.length} ${STATE_LABEL[state]} (${paths.join(', ')})` : null
    })
    .filter((part): part is string => part !== null)
    .join(', ')
}

/**
 * Detection only: inspects the AI guidance files selected by `config.ai.agents`
 * and reports drift. Never fails (warn at most) — guidance drift is not a hard
 * problem — and never regenerates or overwrites anything.
 */
function checkAiGuidance(projectRoot: string, agents: AgentId[]): DoctorCheck {
  const files = agents.map((agent) =>
    classifyGuidanceFile(agent, readFileOrNull(join(projectRoot, AGENT_FILE_PATHS[agent]))),
  )
  const issues = files.filter((file) => file.state !== 'current')

  const check: DoctorCheck = {
    id: 'ai-guidance',
    title: 'AI guidance files',
    category: 'project',
    status: issues.length === 0 ? 'pass' : 'warn',
    message:
      issues.length === 0
        ? `Agent guidance: all ${files.length} file(s) current (v${GUIDANCE_VERSION}).`
        : `Agent guidance: ${files.length - issues.length}/${files.length} current — ${describeIssues(issues)}.`,
    details: { version: GUIDANCE_VERSION, files },
  }
  if (issues.length > 0) {
    // Intentionally not `init --force` — that reruns the whole scaffold and could
    // overwrite unrelated files. A guidance-only regeneration command lands in V1.
    check.remediation =
      'Run `testpilot add ai` to preview, then `testpilot add ai --write` to create missing / refresh stale guidance files (hand-edited files need `--force`).'
  }
  return check
}

/**
 * Validates `suites` — structurally always, and against the real tag vocabulary
 * when it could be read.
 *
 * A suite naming a tag no test carries is the tag-era version of the Phase 9
 * false green: `run --suite nightly` exits 0 having run nothing. Structural
 * problems fail; an unknown tag warns, because the tag may simply not be
 * written yet.
 */
async function checkSuites(
  suites: SuiteMap,
  vocabulary: (() => Promise<ReadonlySet<string> | null>) | undefined,
): Promise<DoctorCheck> {
  const names = Object.keys(suites)
  if (names.length === 0) {
    return {
      id: 'suites',
      title: 'Tag suites',
      category: 'config',
      status: 'pass',
      message: 'No suites configured.',
    }
  }

  const issues = validateSuites(suites)
  const blocking = issues.filter((issue) => issue.severity === 'fail')
  if (blocking.length > 0) {
    return {
      id: 'suites',
      title: 'Tag suites',
      category: 'config',
      status: 'fail',
      message: blocking.map((issue) => issue.message).join(' '),
      remediation: 'Fix the `suites` entries in testpilot.config.ts.',
      details: { issues },
    }
  }

  let known: ReadonlySet<string> | null = null
  try {
    known = vocabulary ? await vocabulary() : null
  } catch {
    known = null
  }
  if (!known) {
    return {
      id: 'suites',
      title: 'Tag suites',
      category: 'config',
      status: 'warn',
      message: `${names.length} suite(s) are well-formed, but the suite's tags could not be read, so referenced tags were not verified.`,
      remediation: 'Run `testpilot tags` to see which tags actually exist.',
    }
  }

  const unknownBySuite: Record<string, string[]> = {}
  for (const name of names.sort()) {
    const entry = suites[name]
    const unknown = entry ? unknownSuiteTags(entry, known) : []
    if (unknown.length > 0) {
      unknownBySuite[name] = unknown
    }
  }
  const offenders = Object.keys(unknownBySuite)
  if (offenders.length > 0) {
    return {
      id: 'suites',
      title: 'Tag suites',
      category: 'config',
      status: 'warn',
      message: [
        ...offenders.map(
          (name) =>
            `Suite "${name}" references ${(unknownBySuite[name] ?? []).map((tag) => `@${tag}`).join(', ')}, which no test carries — \`--suite ${name}\` would not select what you expect.`,
        ),
        // Non-blocking issues (an awkward suite name) would otherwise be lost
        // whenever an unknown tag happened to be present too.
        ...issues.map((issue) => issue.message),
      ].join(' '),
      remediation:
        'Run `testpilot tags` to see the real vocabulary, then fix `suites` or tag the tests.',
      details: { unknownTags: unknownBySuite, issues },
    }
  }

  if (issues.length > 0) {
    return {
      id: 'suites',
      title: 'Tag suites',
      category: 'config',
      status: 'warn',
      message: issues.map((issue) => issue.message).join(' '),
      details: { issues },
    }
  }

  return {
    id: 'suites',
    title: 'Tag suites',
    category: 'config',
    status: 'pass',
    message: `${names.length} suite(s) configured; every referenced tag exists.`,
  }
}

function overallStatus(checks: DoctorCheck[]): CheckStatus {
  if (checks.some((check) => check.status === 'fail')) return 'fail'
  if (checks.some((check) => check.status === 'warn')) return 'warn'
  return 'pass'
}

function collectNextActions(checks: DoctorCheck[]): string[] {
  const seen = new Set<string>()
  const actions: string[] = []
  for (const check of checks) {
    if (check.status !== 'pass' && check.remediation && !seen.has(check.remediation)) {
      seen.add(check.remediation)
      actions.push(check.remediation)
    }
  }
  return actions
}

/**
 * Diagnoses project readiness and common setup issues. Deterministic, offline,
 * and reusable (CLI, future GitHub Action, programmatic API). Never throws for
 * an invalid config — it records that as a failing `config` check.
 */
export async function runDoctor(options: DoctorOptions): Promise<DoctorReport> {
  const cwd = resolve(options.cwd)
  const nodeVersion = options.nodeVersion ?? process.versions.node
  const projectRoot = findProjectRoot(cwd)
  const hasPackageJson = existsSync(join(projectRoot, 'package.json'))

  let config: TestPilotConfig = defaultConfig
  let configFilePresent = false
  let configDir: string | null = null
  let discovery: ConfigDiscovery = DEFAULT_DISCOVERY
  let roots: string[] = []
  let configCheck: DoctorCheck
  try {
    const result = await loadConfig({ cwd, configPath: options.configPath })
    configFilePresent = result.filepath !== null
    configDir = result.filepath === null ? null : dirname(result.filepath)
    const resolved = resolveDiscovery(result, {
      rootDir: configDir ?? projectRoot,
      disablePlaywrightFallback: options.disablePlaywrightFallback,
    })
    config = resolved.config
    discovery = resolved.discovery
    roots = resolved.discovery.roots
    configCheck = {
      id: 'config',
      title: 'TestPilot config',
      category: 'config',
      status: 'pass',
      message: configFilePresent
        ? `Loaded ${result.filepath}.`
        : discovery.playwrightConfigPath
          ? `No testpilot.config.ts — discovery falls back to ${discovery.playwrightConfigPath}.`
          : 'No testpilot.config.ts found — using defaults.',
    }
  } catch (error) {
    configCheck = {
      id: 'config',
      title: 'TestPilot config',
      category: 'config',
      status: 'fail',
      message: error instanceof ConfigError ? error.message : String(error),
      remediation: 'Fix the errors in testpilot.config.ts.',
    }
  }

  // The same lookup discovery uses, or `doctor` warns "no Playwright config" one line
  // after naming the one discovery just read.
  const located = findPlaywrightConfigNearby(configDir ?? projectRoot, config.playwrightConfig)
  const playwrightConfigPath = located && 'path' in located ? located.path : null
  const ambiguousConfigs = located && 'ambiguous' in located ? located.ambiguous : []
  // Resolve testDir exactly as `analyze`/`fix` do (see resolveRootDir in the CLI):
  // the config file's directory, else the project root. `doctor` must predict what
  // `analyze` will do, so these two fallbacks have to stay in step.
  const missingRoots = roots.filter((root) => !isDirectory(root))
  const testDirExists = roots.length > 0 && missingRoots.length === 0

  const checks: DoctorCheck[] = [
    checkNodeVersion(nodeVersion),
    checkPackageJson(projectRoot, hasPackageJson),
    checkPlaywrightInstalled(resolvePlaywrightBin(projectRoot)),
    checkPlaywrightConfig(playwrightConfigPath, ambiguousConfigs),
    configCheck,
    // A config that failed to load selects nothing — there is no directory and no
    // include list to judge, and grading the built-in defaults would be misleading.
    ...(configCheck.status === 'fail'
      ? []
      : [
          checkTestDirectory(missingRoots, discovery, configDir ?? projectRoot),
          checkIncludeGlobs(config.include, discovery),
        ]),
    ...(discovery.playwrightConfigIgnored || discovery.playwrightConfigPartial
      ? [checkPlaywrightDiscovery(discovery)]
      : []),
    checkProjectStructure(
      configFilePresent,
      playwrightConfigPath !== null || ambiguousConfigs.length > 0,
      testDirExists,
    ),
  ]
  // Guidance files are a TestPilot-project concern. On a repo that has not adopted
  // TestPilot, reporting four "missing" files is noise about someone else's project.
  if (configCheck.status !== 'fail' && Object.keys(config.suites).length > 0) {
    checks.push(await checkSuites(config.suites, options.tagVocabulary))
  }
  if (configFilePresent || options.strictGuidance === true) {
    checks.push(checkAiGuidance(projectRoot, selectedAgents(config.ai.agents)))
  }

  return {
    schemaVersion: DOCTOR_SCHEMA_VERSION,
    command: 'doctor',
    status: overallStatus(checks),
    checks,
    nextActions: collectNextActions(checks),
  }
}
