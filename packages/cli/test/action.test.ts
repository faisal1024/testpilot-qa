import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// packages/cli/test -> repo root
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const actionYml = readFileSync(join(repoRoot, 'action', 'action.yml'), 'utf8')
const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8')

describe('GitHub Action wrapper (action/action.yml)', () => {
  it('declares a composite action that wraps the CLI', () => {
    expect(actionYml).toContain("name: 'TestPilot QA'")
    expect(actionYml).toContain('using: ')
    expect(actionYml).toContain('composite')
  })

  it('exposes the documented inputs', () => {
    for (const input of ['version:', 'patterns:', 'min-score:', 'baseline:', 'output:']) {
      expect(actionYml).toContain(input)
    }
  })

  it('invokes `analyze` and emits SARIF (does not duplicate analysis logic)', () => {
    expect(actionYml).toContain('--reporter sarif')
    expect(actionYml).toContain('--output')
    expect(actionYml).toContain('testpilot-qa@')
    expect(actionYml).toContain('analyze')
  })

  it('writes a PR-friendly summary', () => {
    expect(actionYml).toContain('GITHUB_STEP_SUMMARY')
  })
})

describe('README action example is accurate', () => {
  it('references the action path and only inputs the action actually declares', () => {
    expect(readme).toContain('faisal1024/testpilot-qa/action@v0')
    // Every input used in the README example must exist in action.yml.
    const exampleBlock = readme.slice(readme.indexOf('faisal1024/testpilot-qa/action@v0'))
    for (const input of ['min-score', 'baseline']) {
      if (exampleBlock.includes(`${input}:`)) {
        expect(actionYml).toContain(`${input}:`)
      }
    }
  })

  it('documents pairing with upload-sarif for code scanning', () => {
    expect(readme).toContain('upload-sarif')
  })
})
