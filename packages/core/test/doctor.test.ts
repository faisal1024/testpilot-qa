import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { GUIDANCE_VERSION, generateAgentFiles } from '@testpilot/ai'
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

/** Writes the current AI guidance files into the project (so they are pristine/current). */
function writeAgentFiles(): void {
  for (const file of generateAgentFiles()) {
    const dest = join(dir, file.path)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, file.content)
  }
}

/** Lays down a complete, healthy TestPilot project (including AI guidance files). */
function writeHealthyProject(): void {
  writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
  mkdirSync(join(dir, 'node_modules', '.bin'), { recursive: true })
  writeFileSync(join(dir, 'node_modules', '.bin', PLAYWRIGHT_BIN), '')
  writeFileSync(join(dir, 'playwright.config.ts'), 'export default {}\n')
  mkdirSync(join(dir, 'tests'), { recursive: true })
  writeFileSync(join(dir, 'testpilot.config.ts'), "export default { testDir: 'tests' }\n")
  writeAgentFiles()
}

function checkById(report: DoctorReport, id: string) {
  return report.checks.find((check) => check.id === id)
}

const NODE_OK = '22.0.0'

describe('runDoctor', () => {
  it('resolves testDir against the config file directory, like analyze (monorepo layout)', async () => {
    // Root owns the config + suite; the command runs from a sub-package with its own package.json.
    writeFileSync(join(dir, 'testpilot.config.ts'), "export default { testDir: 'tests' }\n")
    mkdirSync(join(dir, 'tests'))
    mkdirSync(join(dir, 'packages', 'web'), { recursive: true })
    writeFileSync(join(dir, 'packages', 'web', 'package.json'), '{"name":"web"}\n')
    const report = await runDoctor({ cwd: join(dir, 'packages', 'web'), nodeVersion: NODE_OK })
    expect(checkById(report, 'test-directory')?.status).toBe('pass')
  })

  it('anchors testDir at the project root when there is no config file', async () => {
    // Same fallback the CLI uses for `analyze`, so doctor predicts what analyze will do.
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    mkdirSync(join(dir, 'tests'))
    mkdirSync(join(dir, 'src', 'deep'), { recursive: true })
    const report = await runDoctor({ cwd: join(dir, 'src', 'deep'), nodeVersion: NODE_OK })
    expect(checkById(report, 'test-directory')?.status).toBe('pass')
  })

  it('skips AI guidance checks on a project that has not adopted TestPilot', async () => {
    writeFileSync(join(dir, 'package.json'), '{"name":"someone-elses-repo"}\n')
    mkdirSync(join(dir, 'tests'))
    const report = await runDoctor({ cwd: dir, nodeVersion: NODE_OK })
    expect(checkById(report, 'ai-guidance')).toBeUndefined()
    // Nothing in the report mentions guidance files for a repo that never asked for them.
    expect(report.nextActions.join(' ')).not.toContain('add ai')

    const strict = await runDoctor({ cwd: dir, nodeVersion: NODE_OK, strictGuidance: true })
    expect(checkById(strict, 'ai-guidance')?.status).toBe('warn')
  })

  it('names the Playwright config when testDir came from it', async () => {
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    writeFileSync(join(dir, 'playwright.config.ts'), "export default { testDir: 'e2e' }\n")
    mkdirSync(join(dir, 'e2e'))
    const report = await runDoctor({ cwd: dir, nodeVersion: NODE_OK })
    const check = checkById(report, 'test-directory')
    expect(check?.status).toBe('pass')
    expect(check?.message).toContain('playwright.config.ts')
    expect(check?.details?.source).toBe('playwright-config')
    // The label must name what was scanned, not the unused built-in `testDir`.
    expect(check?.message).toContain('"e2e"')
    expect(check?.details?.testDir).toBe('e2e')
  })

  it('tells a bare project that its testDir is only a built-in default', async () => {
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    const check = checkById(await runDoctor({ cwd: dir, nodeVersion: NODE_OK }), 'test-directory')
    expect(check?.status).toBe('warn')
    expect(check?.message).toContain('built-in default')
    expect(check?.remediation).toContain('testpilot.config.ts')
  })

  it('honors --no-playwright-discovery, so it still predicts analyze', async () => {
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    writeFileSync(join(dir, 'playwright.config.ts'), "export default { testDir: 'e2e' }\n")
    mkdirSync(join(dir, 'e2e'))
    const adopted = await runDoctor({ cwd: dir, nodeVersion: NODE_OK })
    expect(checkById(adopted, 'test-directory')?.status).toBe('pass')

    const opted = await runDoctor({
      cwd: dir,
      nodeVersion: NODE_OK,
      disablePlaywrightFallback: true,
    })
    // Without the fallback, `analyze` would look in `tests/` and fail — so must doctor.
    expect(checkById(opted, 'test-directory')?.status).toBe('warn')
  })

  it('finds a Playwright config kept in a sub-directory, like discovery does', async () => {
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')
    mkdirSync(join(dir, 'e2e', 'specs'), { recursive: true })
    writeFileSync(
      join(dir, 'e2e', 'playwright.config.ts'),
      "export default { testDir: './specs' }\n",
    )
    const report = await runDoctor({ cwd: dir, nodeVersion: NODE_OK })
    // Previously: "No Playwright config found" one line above "falls back to e2e/playwright.config.ts".
    expect(checkById(report, 'playwright-config')?.status).toBe('pass')
    expect(checkById(report, 'test-directory')?.details?.testDir).toBe(join('e2e', 'specs'))
  })

  it('passes a complete, healthy project', async () => {
    writeHealthyProject()
    const report = await runDoctor({ cwd: dir, nodeVersion: NODE_OK })

    expect(report.schemaVersion).toBe('1.1')
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

  describe('AI guidance drift', () => {
    function aiCheck(report: DoctorReport) {
      return checkById(report, 'ai-guidance')
    }
    function claudePath() {
      return join(dir, 'CLAUDE.md')
    }

    it('passes when all generated files are current', async () => {
      writeHealthyProject()
      const report = await runDoctor({ cwd: dir, nodeVersion: NODE_OK })
      expect(aiCheck(report)?.status).toBe('pass')
      expect(aiCheck(report)?.message).toContain('current')
      expect(report.status).toBe('pass')
    })

    it('warns when a selected guidance file is missing', async () => {
      writeHealthyProject()
      rmSync(claudePath())
      const report = await runDoctor({ cwd: dir, nodeVersion: NODE_OK })
      expect(aiCheck(report)?.status).toBe('warn')
      expect(aiCheck(report)?.message).toContain('missing')
      // A warning must not flip the project to a hard failure.
      expect(report.status).toBe('warn')
    })

    it('warns when a generated file was user-edited', async () => {
      writeHealthyProject()
      writeFileSync(claudePath(), `${readFileSync(claudePath(), 'utf8')}\nhand edit\n`)
      const report = await runDoctor({ cwd: dir, nodeVersion: NODE_OK })
      expect(aiCheck(report)?.status).toBe('warn')
      expect(aiCheck(report)?.message).toContain('user-edited')
    })

    it('warns when a marker version is stale', async () => {
      writeHealthyProject()
      writeFileSync(
        claudePath(),
        readFileSync(claudePath(), 'utf8').replace(` v${GUIDANCE_VERSION} `, ' v0 '),
      )
      const report = await runDoctor({ cwd: dir, nodeVersion: NODE_OK })
      expect(aiCheck(report)?.status).toBe('warn')
      expect(aiCheck(report)?.message).toContain('stale')
    })

    it('warns when a file has no marker', async () => {
      writeHealthyProject()
      writeFileSync(claudePath(), '# my own notes\n')
      const report = await runDoctor({ cwd: dir, nodeVersion: NODE_OK })
      expect(aiCheck(report)?.status).toBe('warn')
      expect(aiCheck(report)?.message).toContain('unmarked')
    })

    it('only checks the agents selected by config.ai.agents', async () => {
      writeHealthyProject()
      // Keep only CLAUDE.md; remove the others.
      for (const file of ['AGENTS.md', '.github/copilot-instructions.md']) {
        rmSync(join(dir, file))
      }
      rmSync(join(dir, '.cursor', 'rules', 'testpilot-playwright.mdc'))
      writeFileSync(
        join(dir, 'testpilot.config.ts'),
        "export default { ai: { agents: ['claude'] } }\n",
      )
      const report = await runDoctor({ cwd: dir, nodeVersion: NODE_OK })
      expect(aiCheck(report)?.status).toBe('pass')
      const files = (aiCheck(report)?.details?.files as Array<{ agent: string }>) ?? []
      expect(files.map((f) => f.agent)).toEqual(['claude'])
    })

    it('includes structured per-file details', async () => {
      writeHealthyProject()
      rmSync(claudePath())
      const report = await runDoctor({ cwd: dir, nodeVersion: NODE_OK })
      const files = aiCheck(report)?.details?.files as Array<Record<string, unknown>>
      const claude = files.find((f) => f.agent === 'claude')
      expect(claude).toMatchObject({ agent: 'claude', path: 'CLAUDE.md', state: 'missing' })
      expect(claude).toHaveProperty('reason')
      expect(claude).toHaveProperty('expectedVersion')
    })
  })
})
