#!/usr/bin/env node
/**
 * Package smoke test — proves `testpilot-qa` can be packed and used the way a
 * consumer would. It packs the CLI, installs the tarball into a fresh temp
 * project (so the bundled @testpilot/* code + real npm deps must resolve from
 * the published artifact alone), and runs the installed CLI.
 *
 * `npm install` of the tarball needs the npm registry; everything after install
 * is offline. No browsers are downloaded and no Playwright tests are run.
 *
 * Usage: `pnpm -r build && pnpm smoke:package`
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const cliDir = join(repoRoot, 'packages', 'cli')

if (!existsSync(join(cliDir, 'dist', 'cli.js'))) {
  console.error('CLI not built. Run `pnpm -r build` first.')
  process.exit(1)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
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

console.log('smoke:package — packing and installing the CLI as a consumer would\n')

const work = mkdtempSync(join(tmpdir(), 'tp-pkg-'))
const project = join(work, 'consumer')
/** Invokes the installed CLI. Reassigned once the tarball is installed. */
let testpilot = () => {
  throw new Error('CLI was not installed')
}

try {
  // 1) Pack the CLI.
  const pack = run('pnpm', ['pack', '--pack-destination', work], { cwd: cliDir })
  if (pack.status !== 0) {
    throw new Error(`pnpm pack failed:\n${pack.stderr || pack.stdout}`)
  }
  const tarball = readdirSync(work).find((file) => file.endsWith('.tgz'))
  if (!tarball) {
    throw new Error('no tarball produced by pnpm pack')
  }
  console.log(`  • packed ${tarball}`)

  // 2) Install it into a fresh project (needs the registry for real deps).
  mkdirSync(project, { recursive: true })
  writeFileSync(join(project, 'package.json'), '{"name":"consumer","private":true}\n')
  const install = run('npm', ['install', join(work, tarball), '--no-audit', '--no-fund'], {
    cwd: project,
  })
  if (install.status !== 0) {
    throw new Error(`npm install of the tarball failed:\n${install.stderr || install.stdout}`)
  }
  const installedCli = join(project, 'node_modules', 'testpilot-qa', 'dist', 'cli.js')
  if (!existsSync(installedCli)) {
    throw new Error(`installed CLI not found at ${installedCli}`)
  }
  console.log('  • installed the tarball\n')

  // Invoke the *installed* CLI (resolving its bundled code + npm deps).
  testpilot = (args, options = {}) =>
    run(process.execPath, [installedCli, ...args], { cwd: project, ...options })

  check('installed --help lists every command', () => {
    const { status, stdout } = testpilot(['--help'])
    assert(status === 0, `exit ${status}`)
    for (const command of ['init', 'run', 'analyze', 'doctor', 'explain']) {
      assert(stdout.includes(command), `help missing "${command}"`)
    }
  })

  check('installed --version prints a semver', () => {
    const { status, stdout } = testpilot(['--version'])
    assert(status === 0 && /\d+\.\d+\.\d+/.test(stdout), `got ${JSON.stringify(stdout)}`)
  })

  check('installed explain no-xpath --json is parseable', () => {
    const { stdout } = testpilot(['explain', 'no-xpath', '--json'])
    assert(JSON.parse(stdout).id === 'no-xpath', 'unexpected explain output')
  })

  check('installed init scaffolds a project with AI guidance and protects existing files', () => {
    const first = testpilot(['init', 'demo', '--yes', '--json'])
    assert(first.status === 0, `init exit ${first.status}`)
    const created = JSON.parse(first.stdout).created
    for (const file of [
      'package.json',
      'playwright.config.ts',
      'CLAUDE.md',
      'AGENTS.md',
      '.cursor/rules/testpilot-playwright.mdc',
      '.github/copilot-instructions.md',
    ]) {
      assert(existsSync(join(project, 'demo', file)), `generated project missing ${file}`)
    }
    assert(created.includes('CLAUDE.md'), 'AI guidance not reported as created')

    const second = testpilot(['init', 'demo', '--yes', '--json'])
    const reRun = JSON.parse(second.stdout)
    assert(reRun.created.length === 0 && reRun.skipped.length > 0, 're-run did not skip files')
  })

  check('installed doctor --cwd demo --json runs', () => {
    const { stdout } = testpilot(['doctor', '--cwd', join(project, 'demo'), '--json'])
    const report = JSON.parse(stdout)
    assert(report.command === 'doctor', 'unexpected doctor output')
    assert(
      report.checks.some((c) => c.id === 'ai-guidance'),
      'doctor missing ai-guidance check',
    )
  })

  check('installed analyze --cwd demo --json runs', () => {
    const { stdout } = testpilot(['analyze', '--cwd', join(project, 'demo'), '--json'])
    const report = JSON.parse(stdout)
    assert(report.command === 'analyze', 'unexpected analyze output')
    assert(typeof report.score.score === 'number', 'analyze missing score')
  })
} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log('')
if (failures > 0) {
  console.error(`smoke:package FAILED — ${failures} check(s) failed.`)
  process.exit(1)
}
console.log('smoke:package passed — packed, installed, and ran the CLI.')
