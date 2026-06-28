import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ConfigError } from '../config/errors.js'
import { loadConfig } from '../config/load-config.js'
import { type TestPilotConfig, defaultConfig } from '../config/schema.js'
import {
  findPlaywrightConfig,
  findProjectRoot,
  isDirectory,
  resolvePlaywrightBin,
} from '../project/discovery.js'

/** Bumped on changes to the doctor report shape. */
export const DOCTOR_SCHEMA_VERSION = '1.0'

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

function checkPlaywrightConfig(configPath: string | null): DoctorCheck {
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

function checkTestDirectory(testDir: string, exists: boolean): DoctorCheck {
  return exists
    ? {
        id: 'test-directory',
        title: 'Test directory',
        category: 'project',
        status: 'pass',
        message: `Test directory "${testDir}" exists.`,
      }
    : {
        id: 'test-directory',
        title: 'Test directory',
        category: 'project',
        status: 'warn',
        message: `Test directory "${testDir}" was not found.`,
        remediation: 'Create it, or scaffold a project with `testpilot init`.',
      }
}

function checkIncludeGlobs(include: string[]): DoctorCheck {
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

function checkAiGuidance(): DoctorCheck {
  return {
    id: 'ai-guidance',
    title: 'AI guidance files',
    category: 'project',
    status: 'pass',
    message: 'Not checked yet — AI guidance generation arrives in a later milestone.',
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
  let configCheck: DoctorCheck
  try {
    const result = await loadConfig({ cwd, configPath: options.configPath })
    config = result.config
    configFilePresent = result.filepath !== null
    configCheck = {
      id: 'config',
      title: 'TestPilot config',
      category: 'config',
      status: 'pass',
      message: configFilePresent
        ? `Loaded ${result.filepath}.`
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

  const playwrightConfigPath = findPlaywrightConfig(projectRoot, config.playwrightConfig)
  // Resolve testDir against the discovered project root (not the invocation cwd)
  // so running `doctor` from a subdirectory doesn't falsely report it missing.
  const testDirExists = isDirectory(join(projectRoot, config.testDir))

  const checks: DoctorCheck[] = [
    checkNodeVersion(nodeVersion),
    checkPackageJson(projectRoot, hasPackageJson),
    checkPlaywrightInstalled(resolvePlaywrightBin(projectRoot)),
    checkPlaywrightConfig(playwrightConfigPath),
    configCheck,
    checkTestDirectory(config.testDir, testDirExists),
    checkIncludeGlobs(config.include),
    checkProjectStructure(configFilePresent, playwrightConfigPath !== null, testDirExists),
    checkAiGuidance(),
  ]

  return {
    schemaVersion: DOCTOR_SCHEMA_VERSION,
    command: 'doctor',
    status: overallStatus(checks),
    checks,
    nextActions: collectNextActions(checks),
  }
}
