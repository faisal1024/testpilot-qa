import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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

describe('GitHub Action wrapper — what the CLI actually receives', () => {
  // Runs the composite step's real shell body under bash, with a stand-in `npx`
  // that records its arguments. Reading the YAML cannot catch this class of
  // bug: the text looked right and bash changed the arguments at runtime.
  function runAction(patterns: string, files: string[]): string[][] {
    const dir = mkdtempSync(join(tmpdir(), 'tp-action-'))
    try {
      for (const file of files) {
        mkdirSync(join(dir, dirname(file)), { recursive: true })
        writeFileSync(join(dir, file), '')
      }
      const bin = join(dir, 'bin')
      mkdirSync(bin)
      const log = join(dir, 'npx.log')
      // One JSON line per invocation, holding the argv npx was given.
      writeFileSync(
        join(bin, 'npx'),
        `#!/usr/bin/env node\nrequire('fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n')\n`,
      )
      chmodSync(join(bin, 'npx'), 0o755)
      // GitHub runs `shell: bash` steps as `bash --noprofile --norc -eo pipefail`.
      const result = spawnSync(
        'bash',
        ['--noprofile', '--norc', '-eo', 'pipefail', '-c', runBody],
        {
          cwd: dir,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            TP_VERSION: 'latest',
            TP_PATTERNS: patterns,
            TP_MIN_SCORE: '',
            TP_BASELINE: '',
            TP_OUTPUT: 'testpilot.sarif',
            GITHUB_OUTPUT: join(dir, 'out'),
            GITHUB_STEP_SUMMARY: join(dir, 'summary'),
          },
        },
      )
      expect(result.status, result.stderr).toBe(0)
      return readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as string[])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('passes a glob to the CLI verbatim instead of letting bash expand it', () => {
    // Files at three depths. Bash without globstar expands `**` as `*`, which
    // matched only `tests/ui/x.spec.ts` — the other two were silently dropped.
    const calls = runAction('tests/**/*.spec.ts', [
      'tests/top.spec.ts',
      'tests/ui/x.spec.ts',
      'tests/deep/er/y.spec.ts',
    ])
    expect(calls).toHaveLength(2)
    for (const argv of calls) {
      expect(argv).toContain('tests/**/*.spec.ts')
      expect(argv).not.toContain('tests/ui/x.spec.ts')
    }
  })

  it('still splits several whitespace-separated patterns', () => {
    const calls = runAction('e2e/**/*.ts  tests/*.spec.ts', ['e2e/a.ts', 'tests/b.spec.ts'])
    for (const argv of calls) {
      expect(argv).toContain('e2e/**/*.ts')
      expect(argv).toContain('tests/*.spec.ts')
    }
  })

  it('keeps every line of a multi-line patterns block', () => {
    // `patterns: |` with one glob per line is natural YAML. `read -a` would
    // stop at the first newline and silently drop the rest — the bug this file
    // fixes, in another shape — so this pins the newline split too.
    const calls = runAction('e2e/**/*.ts\ntests/*.spec.ts\n', ['e2e/a.ts', 'tests/b.spec.ts'])
    for (const argv of calls) {
      expect(argv).toContain('e2e/**/*.ts')
      expect(argv).toContain('tests/*.spec.ts')
    }
  })

  it('treats a whitespace-only input as no pattern, without crashing', () => {
    // Splits to nothing. Through an intermediate array this crashed under
    // `set -u` on bash < 4.4; appended straight onto `common` it cannot.
    for (const blank of [' ', '\n', '\t \n']) {
      const [summary] = runAction(blank, ['tests/a.spec.ts'])
      expect(summary, JSON.stringify(blank)).toEqual(['--yes', 'testpilot-qa@latest', 'analyze'])
    }
    // The crash only reproduces on bash < 4.4 (macOS's /bin/bash); CI's bash 5
    // accepts an empty "${arr[@]}" under `set -u`. So also pin the shape that
    // makes it impossible: patterns go straight onto `common`, globbing off.
    expect(runBody).toMatch(/set -f\n(?:\s*#.*\n)*\s*common\+=\(\$\{TP_PATTERNS\}\)\n\s*set \+f/)
  })

  it('passes no pattern at all when the input is empty', () => {
    const [summary] = runAction('', ['tests/a.spec.ts'])
    expect(summary).toEqual(['--yes', 'testpilot-qa@latest', 'analyze'])
  })
})
