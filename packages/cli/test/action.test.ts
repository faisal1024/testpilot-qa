import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

// packages/cli/test -> repo root
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const actionRaw = readFileSync(join(repoRoot, 'action', 'action.yml'), 'utf8')
const action = parse(actionRaw) as {
  name: string
  inputs: Record<string, { description?: string; default?: string }>
  outputs: Record<string, { value?: string }>
  runs: { using: string; steps: Array<{ uses?: string; run?: string; shell?: string }> }
}
const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8')

// The shell body of the composite step (the part that invokes the CLI).
const runStep = action.runs.steps.find((s) => typeof s.run === 'string')
const runBody = runStep?.run ?? ''

describe('GitHub Action wrapper (action/action.yml)', () => {
  it('is valid YAML for a composite action', () => {
    expect(action.name).toBe('TestPilot QA')
    expect(action.runs.using).toBe('composite')
    expect(action.runs.steps.length).toBeGreaterThan(0)
  })

  it('declares the documented inputs', () => {
    for (const input of ['version', 'patterns', 'min-score', 'baseline', 'output']) {
      expect(action.inputs).toHaveProperty(input)
    }
  })

  it('exposes the SARIF path as an output', () => {
    expect(action.outputs).toHaveProperty('sarif')
  })

  it('invokes `analyze` and emits SARIF (does not duplicate analysis logic)', () => {
    expect(runBody).toContain('testpilot-qa@')
    expect(runBody).toContain('analyze')
    expect(runBody).toContain('--reporter sarif')
    expect(runBody).toContain('--output')
  })

  it('writes a PR-friendly summary', () => {
    expect(runBody).toContain('GITHUB_STEP_SUMMARY')
  })
})

describe('README action example is accurate', () => {
  it('references the action path and only uses inputs the action declares', () => {
    expect(readme).toContain('faisal1024/testpilot-qa/action@v0')
    // Scope to this action's step (up to the next `- uses:`), then read its
    // `with:` keys (indented 10+ spaces) and assert each is a declared input.
    const rest = readme.slice(readme.indexOf('faisal1024/testpilot-qa/action@v0'))
    const nextStep = rest.indexOf('- uses:', 1)
    const block = nextStep === -1 ? rest : rest.slice(0, nextStep)
    const withKeys = [...block.matchAll(/^\s{10,}([a-z][a-z0-9-]*):/gm)].map((m) => m[1])
    expect(withKeys.length).toBeGreaterThan(0)
    for (const key of withKeys) {
      expect(Object.keys(action.inputs)).toContain(key)
    }
  })

  it('documents pairing with upload-sarif for code scanning', () => {
    expect(readme).toContain('upload-sarif')
  })
})
