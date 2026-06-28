#!/usr/bin/env node
/**
 * MVP smoke test — exercises the built CLI end to end, offline and fast.
 *
 * Verifies: --help / --version, `explain --json`, `doctor --json`, `analyze`
 * against a temp spec, and `init` scaffolding (expected files, generated
 * scripts, README note, and overwrite protection). No network or browsers.
 *
 * Usage: `pnpm -r build && pnpm smoke:mvp`
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const CLI = join(repoRoot, 'packages', 'cli', 'dist', 'cli.js')

if (!existsSync(CLI)) {
  console.error(`CLI not built at ${CLI}\nRun \`pnpm -r build\` first.`)
  process.exit(1)
}

function cli(args, options = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...options })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'tp-smoke-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

let failures = 0
function check(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (error) {
    failures += 1
    console.error(`  ✗ ${name}\n      ${error instanceof Error ? error.message : String(error)}`)
  }
}

console.log('smoke:mvp — verifying the built CLI\n')

check('--help lists every MVP command', () => {
  const { status, stdout } = cli(['--help'])
  assert(status === 0, `exit ${status}`)
  for (const command of ['init', 'run', 'analyze', 'doctor', 'explain']) {
    assert(stdout.includes(command), `help is missing "${command}"`)
  }
})

check('--version prints a semver', () => {
  const { status, stdout } = cli(['--version'])
  assert(status === 0, `exit ${status}`)
  assert(/\d+\.\d+\.\d+/.test(stdout), `unexpected version output: ${JSON.stringify(stdout)}`)
})

check('explain no-xpath --json is parseable', () => {
  const { status, stdout } = cli(['explain', 'no-xpath', '--json'])
  assert(status === 0, `exit ${status}`)
  const explanation = JSON.parse(stdout)
  assert(explanation.id === 'no-xpath', 'unexpected explanation id')
  assert(typeof explanation.betterExample === 'string', 'missing betterExample')
})

check('doctor --json is parseable', () => {
  withTempDir((dir) => {
    const { stdout } = cli(['doctor', '--json', '--cwd', dir])
    const report = JSON.parse(stdout)
    assert(report.command === 'doctor', 'unexpected command')
    assert(['pass', 'warn', 'fail'].includes(report.status), `unexpected status ${report.status}`)
    assert(Array.isArray(report.checks) && report.checks.length > 0, 'missing checks')
  })
})

check('analyze reports a finding on a fragile locator', () => {
  withTempDir((dir) => {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, 'tests', 'fragile.spec.ts'), "page.locator('//button')\n")
    const { status, stdout } = cli(['analyze', '--json', '--cwd', dir])
    assert(status === 0, `exit ${status}`)
    const report = JSON.parse(stdout)
    assert(report.command === 'analyze', 'unexpected command')
    assert(
      report.findings.some((finding) => finding.ruleId === 'no-xpath'),
      'expected a no-xpath finding',
    )
    assert(typeof report.score.score === 'number', 'missing score')
  })
})

check('init scaffolds a complete project and protects existing files', () => {
  withTempDir((dir) => {
    const first = cli(['init', 'demo', '--yes', '--json', '--cwd', dir])
    assert(first.status === 0, `exit ${first.status}`)
    const result = JSON.parse(first.stdout)
    assert(result.created.length > 0, 'expected created files')

    const demo = join(dir, 'demo')
    const expected = [
      'package.json',
      'playwright.config.ts',
      'testpilot.config.ts',
      'tests/ui/example.spec.ts',
      'tests/ui/todo.spec.ts',
      'tests/api/example.spec.ts',
      'README.md',
      '.github/workflows/e2e.yml',
    ]
    for (const file of expected) {
      assert(existsSync(join(demo, file)), `generated project is missing ${file}`)
    }

    const pkg = JSON.parse(readFileSync(join(demo, 'package.json'), 'utf8'))
    for (const script of [
      'test:e2e',
      'test:e2e:ui',
      'test:e2e:api',
      'test:e2e:parallel',
      'test:e2e:headed',
    ]) {
      assert(pkg.scripts?.[script], `generated package.json is missing script "${script}"`)
    }

    const readme = readFileSync(join(demo, 'README.md'), 'utf8')
    assert(
      /plain Playwright/i.test(readme),
      'generated README is missing the plain-Playwright note',
    )

    // Re-run without --force: nothing should be overwritten.
    const second = cli(['init', 'demo', '--yes', '--json', '--cwd', dir])
    const reRun = JSON.parse(second.stdout)
    assert(reRun.created.length === 0, 'second init unexpectedly created files')
    assert(reRun.skipped.length > 0, 'second init did not skip existing files')
  })
})

console.log('')
if (failures > 0) {
  console.error(`smoke:mvp FAILED — ${failures} check(s) failed.`)
  process.exit(1)
}
console.log('smoke:mvp passed — all checks green.')
