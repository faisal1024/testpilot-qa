import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ScaffoldError, scaffoldProject } from '../src/index.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'testpilot-scaffold-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const EXPECTED_FILES = [
  'package.json',
  'playwright.config.ts',
  'testpilot.config.ts',
  'tests/ui/example.spec.ts',
  'tests/ui/todo.spec.ts',
  'tests/api/example.spec.ts',
  '.gitignore',
  '.github/workflows/e2e.yml',
  'README.md',
  // AI agent guidance files (@testpilot/ai)
  'CLAUDE.md',
  'AGENTS.md',
  '.cursor/rules/testpilot-playwright.mdc',
  '.github/copilot-instructions.md',
]

describe('scaffoldProject', () => {
  it('generates a complete ui-api-fullstack project', () => {
    const result = scaffoldProject({ targetDir: dir, projectName: 'demo' })

    expect(result.templateId).toBe('ui-api-fullstack')
    expect(result.created).toEqual(EXPECTED_FILES)
    expect(result.skipped).toEqual([])
    for (const file of EXPECTED_FILES) {
      expect(existsSync(join(dir, file)), file).toBe(true)
    }
  })

  it('generates an installable project that does not depend on testpilot-qa', () => {
    scaffoldProject({ targetDir: dir, projectName: 'demo' })

    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    expect(pkg.name).toBe('demo')
    expect(pkg.scripts['test:e2e']).toBe('playwright test')
    expect(pkg.devDependencies['@playwright/test']).toBeDefined()
    // Must stay installable before testpilot-qa is published.
    expect(pkg.devDependencies['testpilot-qa']).toBeUndefined()

    const tpConfig = readFileSync(join(dir, 'testpilot.config.ts'), 'utf8')
    expect(tpConfig).toContain("testDir: 'tests'")
    expect(tpConfig).toContain("playwrightConfig: 'playwright.config.ts'")
    // No import — loads without testpilot-qa installed.
    expect(tpConfig).not.toContain("from 'testpilot-qa'")

    const pwConfig = readFileSync(join(dir, 'playwright.config.ts'), 'utf8')
    expect(pwConfig).toContain("from '@playwright/test'")
  })

  it('configures Playwright for parallel execution', () => {
    scaffoldProject({ targetDir: dir, projectName: 'demo' })
    const pwConfig = readFileSync(join(dir, 'playwright.config.ts'), 'utf8')
    expect(pwConfig).toContain('fullyParallel: true')
    expect(pwConfig).toContain('workers:')
    expect(pwConfig).toContain('process.env.CI ? 2 : undefined')
  })

  it('generates plain-Playwright execution scripts', () => {
    scaffoldProject({ targetDir: dir, projectName: 'demo' })
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    expect(pkg.scripts).toMatchObject({
      'test:e2e': 'playwright test',
      'test:e2e:ui': 'playwright test tests/ui',
      'test:e2e:api': 'playwright test tests/api',
      'test:e2e:parallel': 'playwright test --workers=2',
      'test:e2e:headed': 'playwright test --headed',
    })
  })

  it('generates two independent UI samples and one API sample', () => {
    scaffoldProject({ targetDir: dir, projectName: 'demo' })
    expect(existsSync(join(dir, 'tests/ui/example.spec.ts'))).toBe(true)
    expect(existsSync(join(dir, 'tests/ui/todo.spec.ts'))).toBe(true)
    expect(existsSync(join(dir, 'tests/api/example.spec.ts'))).toBe(true)
    // The samples use user-facing locators only (clean for the analyzer).
    const todo = readFileSync(join(dir, 'tests/ui/todo.spec.ts'), 'utf8')
    expect(todo).toContain('getByLabel')
    expect(todo).toContain('getByRole')
    expect(todo).not.toContain('waitForTimeout')
  })

  it('defaults the project name to the target directory basename', () => {
    const result = scaffoldProject({ targetDir: dir })
    expect(result.projectName).toBe(result.targetDir.split('/').pop())
  })

  it('does not overwrite existing files without --force', () => {
    const pkgPath = join(dir, 'package.json')
    writeFileSync(pkgPath, '{"existing":true}')

    const result = scaffoldProject({ targetDir: dir, projectName: 'demo' })

    expect(result.skipped).toContain('package.json')
    expect(result.created).not.toContain('package.json')
    expect(JSON.parse(readFileSync(pkgPath, 'utf8'))).toEqual({ existing: true })
  })

  it('overwrites existing files when force is set', () => {
    const pkgPath = join(dir, 'package.json')
    writeFileSync(pkgPath, '{"existing":true}')

    const result = scaffoldProject({ targetDir: dir, projectName: 'demo', force: true })

    expect(result.created).toContain('package.json')
    expect(JSON.parse(readFileSync(pkgPath, 'utf8')).name).toBe('demo')
  })

  it('throws ScaffoldError for an unknown template', () => {
    expect(() => scaffoldProject({ targetDir: dir, templateId: 'nope' })).toThrow(ScaffoldError)
  })

  it('generates the AI agent guidance files with generated markers', () => {
    scaffoldProject({ targetDir: dir, projectName: 'demo' })
    for (const file of [
      'CLAUDE.md',
      'AGENTS.md',
      '.cursor/rules/testpilot-playwright.mdc',
      '.github/copilot-instructions.md',
    ]) {
      expect(existsSync(join(dir, file)), file).toBe(true)
      expect(readFileSync(join(dir, file), 'utf8')).toContain('@testpilot/guidance')
    }
  })

  it('skips an existing AI file without --force and overwrites with --force', () => {
    const claude = join(dir, 'CLAUDE.md')
    writeFileSync(claude, '# my notes\n')

    const skip = scaffoldProject({ targetDir: dir, projectName: 'demo' })
    expect(skip.skipped).toContain('CLAUDE.md')
    expect(skip.created).not.toContain('CLAUDE.md')
    expect(readFileSync(claude, 'utf8')).toBe('# my notes\n')

    const forced = scaffoldProject({ targetDir: dir, projectName: 'demo', force: true })
    expect(forced.created).toContain('CLAUDE.md')
    expect(readFileSync(claude, 'utf8')).toContain('@testpilot/guidance')
  })

  it('honors the agents option', () => {
    const result = scaffoldProject({ targetDir: dir, projectName: 'demo', agents: ['claude'] })
    expect(result.created).toContain('CLAUDE.md')
    expect(result.created).not.toContain('AGENTS.md')
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(false)
  })
})
