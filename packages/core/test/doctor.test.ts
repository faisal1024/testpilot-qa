import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type DoctorReport, runDoctor } from '../src/index.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'testpilot-doctor-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const PLAYWRIGHT_BIN = process.platform === 'win32' ? 'playwright.cmd' : 'playwright'

/** Lays down a complete, healthy TestPilot project. */
function writeHealthyProject(): void {
  writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
  mkdirSync(join(dir, 'node_modules', '.bin'), { recursive: true })
  writeFileSync(join(dir, 'node_modules', '.bin', PLAYWRIGHT_BIN), '')
  writeFileSync(join(dir, 'playwright.config.ts'), 'export default {}\n')
  mkdirSync(join(dir, 'tests'), { recursive: true })
  writeFileSync(join(dir, 'testpilot.config.ts'), "export default { testDir: 'tests' }\n")
}

function checkById(report: DoctorReport, id: string) {
  return report.checks.find((check) => check.id === id)
}

const NODE_OK = '22.0.0'

describe('runDoctor', () => {
  it('passes a complete, healthy project', async () => {
    writeHealthyProject()
    const report = await runDoctor({ cwd: dir, nodeVersion: NODE_OK })

    expect(report.schemaVersion).toBe('1.0')
    expect(report.command).toBe('doctor')
    expect(report.status).toBe('pass')
    expect(report.checks.every((check) => check.status === 'pass')).toBe(true)
    expect(report.nextActions).toEqual([])
  })

  it('is JSON-serializable and deterministic', async () => {
    writeHealthyProject()
    const a = await runDoctor({ cwd: dir, nodeVersion: NODE_OK })
    const b = await runDoctor({ cwd: dir, nodeVersion: NODE_OK })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.parse(JSON.stringify(a))).toEqual(a)
  })

  it('fails when Node is too old', async () => {
    writeHealthyProject()
    const report = await runDoctor({ cwd: dir, nodeVersion: '18.17.0' })
    expect(checkById(report, 'node-version')?.status).toBe('fail')
    expect(report.status).toBe('fail')
  })

  it('fails when package.json is missing', async () => {
    // No package.json anywhere under the temp dir.
    const report = await runDoctor({ cwd: dir, nodeVersion: NODE_OK })
    expect(checkById(report, 'package-json')?.status).toBe('fail')
    expect(report.status).toBe('fail')
  })

  it('fails when Playwright is not installed', async () => {
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    writeFileSync(join(dir, 'playwright.config.ts'), 'export default {}\n')
    mkdirSync(join(dir, 'tests'), { recursive: true })
    const report = await runDoctor({ cwd: dir, nodeVersion: NODE_OK })
    expect(checkById(report, 'playwright-installed')?.status).toBe('fail')
    expect(report.status).toBe('fail')
  })

  it('flags an invalid config as a failing config check', async () => {
    writeHealthyProject()
    writeFileSync(
      join(dir, 'testpilot.config.ts'),
      'export default { scoring: { minScore: 999 } }\n',
    )
    const report = await runDoctor({ cwd: dir, nodeVersion: NODE_OK })
    const config = checkById(report, 'config')
    expect(config?.status).toBe('fail')
    expect(config?.category).toBe('config')
    expect(report.status).toBe('fail')
  })

  it('warns (not fails) when the test directory is missing', async () => {
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    mkdirSync(join(dir, 'node_modules', '.bin'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', '.bin', PLAYWRIGHT_BIN), '')
    writeFileSync(join(dir, 'playwright.config.ts'), 'export default {}\n')
    writeFileSync(join(dir, 'testpilot.config.ts'), "export default { testDir: 'tests' }\n")
    const report = await runDoctor({ cwd: dir, nodeVersion: NODE_OK })
    expect(checkById(report, 'test-directory')?.status).toBe('warn')
    expect(report.status).toBe('warn')
    expect(report.nextActions.length).toBeGreaterThan(0)
  })

  it('resolves the test directory from the project root, not the invocation cwd', async () => {
    writeHealthyProject()
    const nested = join(dir, 'src', 'features')
    mkdirSync(nested, { recursive: true })
    const report = await runDoctor({ cwd: nested, nodeVersion: NODE_OK })
    expect(checkById(report, 'test-directory')?.status).toBe('pass')
    expect(checkById(report, 'project-structure')?.status).toBe('pass')
    expect(report.status).toBe('pass')
  })

  it('does not fake AI guidance drift detection', async () => {
    writeHealthyProject()
    const report = await runDoctor({ cwd: dir, nodeVersion: NODE_OK })
    const ai = checkById(report, 'ai-guidance')
    expect(ai?.status).toBe('pass')
    expect(ai?.message.toLowerCase()).toContain('not checked yet')
  })
})
