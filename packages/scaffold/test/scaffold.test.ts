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
  'tests/api/example.spec.ts',
  '.gitignore',
  '.github/workflows/e2e.yml',
  'README.md',
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

  it('generates plain Playwright config and a testpilot-qa-backed config', () => {
    scaffoldProject({ targetDir: dir, projectName: 'demo' })

    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    expect(pkg.name).toBe('demo')
    expect(pkg.scripts['test:e2e']).toBe('playwright test')
    expect(pkg.devDependencies['@playwright/test']).toBeDefined()

    const tpConfig = readFileSync(join(dir, 'testpilot.config.ts'), 'utf8')
    expect(tpConfig).toContain("from 'testpilot-qa'")

    const pwConfig = readFileSync(join(dir, 'playwright.config.ts'), 'utf8')
    expect(pwConfig).toContain("from '@playwright/test'")
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
})
