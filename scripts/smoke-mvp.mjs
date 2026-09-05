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

check('--help lists every command', () => {
  const { status, stdout } = cli(['--help'])
  assert(status === 0, `exit ${status}`)
  for (const command of ['init', 'run', 'analyze', 'doctor', 'explain', 'add']) {
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

check('analyze --output writes a report file', () => {
  withTempDir((dir) => {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, 'tests', 'fragile.spec.ts'), "page.locator('//button')\n")
    const out = join(dir, 'report.json')
    const { status, stdout } = cli(['analyze', '--output', out, '--cwd', dir])
    assert(status === 0, `exit ${status}`)
    assert(stdout.includes('Report written to'), 'missing confirmation message')
    const report = JSON.parse(readFileSync(out, 'utf8'))
    assert(report.command === 'analyze', 'output file is not a valid analyze report')
  })
})

check('analyze --reporter sarif writes a valid SARIF file', () => {
  withTempDir((dir) => {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, 'tests', 'fragile.spec.ts'), "page.locator('//button')\n")
    const out = join(dir, 'testpilot.sarif')
    const { status } = cli(['analyze', '--reporter', 'sarif', '--output', out, '--cwd', dir])
    assert(status === 0, `exit ${status}`)
    const sarif = JSON.parse(readFileSync(out, 'utf8'))
    assert(sarif.version === '2.1.0', `unexpected SARIF version ${sarif.version}`)
    const result = sarif.runs?.[0]?.results?.find((r) => r.ruleId === 'no-xpath')
    assert(result, 'SARIF is missing the no-xpath result')
    assert(
      result.locations?.[0]?.physicalLocation?.artifactLocation?.uri?.includes('fragile.spec.ts'),
      'SARIF result is missing the source location',
    )
  })
})

check('analyze --reporter html writes a self-contained report', () => {
  withTempDir((dir) => {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, 'tests', 'fragile.spec.ts'), "page.locator('//button')\n")
    const out = join(dir, 'report.html')
    const { status } = cli(['analyze', '--reporter', 'html', '--output', out, '--cwd', dir])
    assert(status === 0, `exit ${status}`)
    const html = readFileSync(out, 'utf8')
    assert(html.startsWith('<!doctype html>'), 'not an HTML document')
    assert(html.includes('no-xpath'), 'HTML is missing the finding')
    assert(!/<script/i.test(html), 'HTML must not contain scripts')
    assert(
      !/https?:\/\/(?!github\.com\/faisal1024\/testpilot-qa\/)/.test(html),
      'HTML must not reference external assets',
    )
  })
})

check('analyze --baseline gates only on new findings', () => {
  withTempDir((dir) => {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    writeFileSync(join(dir, 'tests', 'fragile.spec.ts'), "page.locator('//button')\n")
    const baseline = join(dir, 'baseline.json')

    // Record the current findings.
    const recorded = cli(['analyze', '--baseline', baseline, '--update-baseline', '--cwd', dir])
    assert(recorded.status === 0, `record exit ${recorded.status}`)
    assert(existsSync(baseline), 'baseline file was not written')

    // No new findings → passes.
    const clean = cli(['analyze', '--baseline', baseline, '--cwd', dir])
    assert(clean.status === 0, `expected pass, got exit ${clean.status}`)

    // A brand-new finding → fails with exit 1.
    writeFileSync(join(dir, 'tests', 'slow.spec.ts'), 'page.waitForTimeout(1000)\n')
    const regressed = cli(['analyze', '--baseline', baseline, '--cwd', dir])
    assert(regressed.status === 1, `expected exit 1 on regression, got ${regressed.status}`)
    assert(regressed.stdout.includes('no-hard-wait'), 'regression output missing the new rule')
  })
})

check('fix previews then applies a safe mechanical rewrite (dry-run by default)', () => {
  withTempDir((dir) => {
    mkdirSync(join(dir, 'tests'), { recursive: true })
    const spec = join(dir, 'tests', 'fixme.spec.ts')
    const original = "await page.locator('text=Submit').click()\n"
    writeFileSync(spec, original)

    // Dry-run: shows a diff, writes nothing.
    const preview = cli(['fix', '--cwd', dir])
    assert(preview.status === 0, `exit ${preview.status}`)
    assert(
      /\+await page\.getByText\('Submit'\)/.test(preview.stdout),
      'dry-run did not preview the fix',
    )
    assert(readFileSync(spec, 'utf8') === original, 'dry-run unexpectedly modified the file')

    // --write applies it; a second run is idempotent.
    const applied = cli(['fix', '--write', '--cwd', dir])
    assert(applied.status === 0, `exit ${applied.status}`)
    assert(
      readFileSync(spec, 'utf8') === "await page.getByText('Submit').click()\n",
      'fix --write did not rewrite the locator',
    )
    const again = cli(['fix', '--write', '--cwd', dir])
    assert(/No mechanical fixes/.test(again.stdout), 'fix was not idempotent')
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
      // AI agent guidance files
      'CLAUDE.md',
      'AGENTS.md',
      '.cursor/rules/testpilot-playwright.mdc',
      '.github/copilot-instructions.md',
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

check('add ai regenerates guidance files (dry-run by default, --write applies)', () => {
  withTempDir((dir) => {
    // Dry-run on an empty dir: previews, writes nothing.
    const preview = cli(['add', 'ai', 'claude', '--cwd', dir])
    assert(preview.status === 0, `exit ${preview.status}`)
    assert(/would create/.test(preview.stdout), 'dry-run did not preview a create')
    assert(!existsSync(join(dir, 'CLAUDE.md')), 'dry-run unexpectedly wrote a file')

    // --write creates it; a second run reports it current and is idempotent.
    const written = cli(['add', 'ai', 'claude', '--write', '--cwd', dir])
    assert(written.status === 0, `exit ${written.status}`)
    assert(existsSync(join(dir, 'CLAUDE.md')), 'CLAUDE.md was not created')
    const first = readFileSync(join(dir, 'CLAUDE.md'), 'utf8')
    cli(['add', 'ai', 'claude', '--write', '--cwd', dir])
    assert(
      readFileSync(join(dir, 'CLAUDE.md'), 'utf8') === first,
      'second --write was not idempotent',
    )

    const rerun = cli(['add', 'ai', 'claude', '--json', '--cwd', dir])
    assert(JSON.parse(rerun.stdout).summary.unchanged === 1, 'expected the file to be current')
  })
})

check('doctor reports AI guidance as current for a fresh scaffold', () => {
  withTempDir((dir) => {
    cli(['init', 'demo', '--yes', '--cwd', dir])
    const { stdout } = cli(['doctor', '--json', '--cwd', join(dir, 'demo')])
    const report = JSON.parse(stdout)
    const ai = report.checks.find((check) => check.id === 'ai-guidance')
    assert(ai !== undefined, 'doctor is missing the ai-guidance check')
    assert(ai.status === 'pass', `ai-guidance status was ${ai.status}, expected pass`)
  })
})

check('analyze flags the expected rules in examples/fragile-suite', () => {
  const { status, stdout } = cli(['analyze', 'examples/fragile-suite', '--json'], { cwd: repoRoot })
  assert(status === 0, `exit ${status}`)
  const report = JSON.parse(stdout)
  assert(report.summary.filesAnalyzed >= 1, 'no example files analyzed')
  assert(typeof report.score.score === 'number', 'missing score')
  const ruleIds = new Set(report.findings.map((finding) => finding.ruleId))
  for (const rule of ['no-xpath', 'no-css-class-selector', 'no-hard-wait']) {
    assert(ruleIds.has(rule), `example analysis missing ${rule}`)
  }
})

console.log('')
if (failures > 0) {
  console.error(`smoke:mvp FAILED — ${failures} check(s) failed.`)
  process.exit(1)
}
console.log('smoke:mvp passed — all checks green.')
