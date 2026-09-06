#!/usr/bin/env node
/**
 * Runs the built CLI against pinned commits of real open-source Playwright suites and
 * compares the result to a committed baseline.
 *
 * This exists because every discovery defect found during Phase 9 was caught by hand,
 * one at a time, on fixtures invented after the fact. A rule or scoring change that
 * quietly halves what gets analyzed on a real repo is invisible to unit tests — this
 * is the tool's own no-regression gate, the same thing `--baseline` gives its users.
 *
 *   pnpm bench                     # compare against bench/baseline.json
 *   pnpm bench --update-baseline   # record the current numbers
 *   pnpm bench --only cal.com      # one repo
 *
 * Requires a prior `pnpm -r build` and network access on first run; clones are cached
 * under .bench-cache/ (gitignored) and reused.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatDiff } from './bench-compare.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const cacheDir = join(root, '.bench-cache')
const corpus = JSON.parse(readFileSync(join(root, 'bench', 'corpus.json'), 'utf8'))
const baselinePath = join(root, 'bench', 'baseline.json')
const resultsPath = join(root, 'bench', 'results.json')
const cli = join(root, 'packages', 'cli', 'dist', 'cli.js')

const args = process.argv.slice(2)
const updateBaseline = args.includes('--update-baseline')
const onlyIndex = args.indexOf('--only')
const only = onlyIndex === -1 ? null : args[onlyIndex + 1]

function run(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  })
}

/** Blobless + sparse clone: the test trees only, at a pinned commit. */
function ensureCheckout(repo) {
  const dir = join(cacheDir, repo.name)
  if (!existsSync(join(dir, '.git'))) {
    mkdirSync(dir, { recursive: true })
    run('git', ['init', '--quiet'], { cwd: dir })
    run('git', ['remote', 'add', 'origin', repo.url], { cwd: dir })
    run('git', ['config', 'core.sparseCheckout', 'true'], { cwd: dir })
  }
  // A freshly-initialized repo has no HEAD; that is a cache miss, not a failure.
  let head = ''
  try {
    head = run('git', ['rev-parse', 'HEAD'], { cwd: dir }).trim()
  } catch {
    head = ''
  }
  if (head === repo.ref) return dir

  run('git', ['sparse-checkout', 'set', '--no-cone', ...repo.sparse], { cwd: dir })
  run('git', ['fetch', '--quiet', '--depth', '1', '--filter=blob:none', 'origin', repo.ref], {
    cwd: dir,
  })
  run('git', ['checkout', '--quiet', repo.ref], { cwd: dir })
  return dir
}

/** What the CLI reports, reduced to the numbers a regression would move. */
function measure(repo, dir) {
  // Some suites live in a workspace package whose Playwright config is deeper than the
  // one-level lookup; a contributor would run from that package, so the benchmark does.
  const cwd = repo.cwd ? join(dir, repo.cwd) : dir
  const started = Date.now()
  let raw
  let exitCode = 0
  try {
    raw = run('node', [cli, 'analyze', '--cwd', cwd, '--json', '--no-color'])
  } catch (error) {
    // A non-zero exit is a legitimate outcome (a gate, or a discovery failure) — the
    // report still went to stdout, and its absence is itself the finding.
    exitCode = error.status ?? 1
    raw = error.stdout ?? ''
  }
  const elapsedMs = Date.now() - started

  let report
  try {
    report = JSON.parse(raw)
  } catch {
    return { name: repo.name, error: 'analyze produced no JSON report', exitCode }
  }

  const byRule = {}
  for (const finding of report.findings ?? []) {
    byRule[finding.ruleId] = (byRule[finding.ruleId] ?? 0) + 1
  }
  return {
    name: repo.name,
    exitCode,
    filesAnalyzed: report.summary?.filesAnalyzed ?? 0,
    parseErrors: report.summary?.filesWithParseErrors ?? 0,
    findings: report.summary?.findings ?? 0,
    score: report.score?.score ?? null,
    grade: report.score?.grade ?? null,
    callSites: report.score?.callSites ?? 0,
    byRule: Object.fromEntries(Object.entries(byRule).sort(([a], [b]) => a.localeCompare(b))),
    warnings: (report.warnings ?? []).map((warning) => warning.code).sort(),
    discovery: {
      testDir: report.discovery?.testDir ?? null,
      include: report.discovery?.include ?? null,
    },
    // Recorded, never compared: it is machine-dependent and would make every diff noisy.
    elapsedMs,
  }
}

if (!existsSync(cli)) {
  console.error('Build first: pnpm -r build')
  process.exit(1)
}

const repos = corpus.repos.filter((repo) => !only || repo.name === only)
const results = []
for (const repo of repos) {
  process.stderr.write(`• ${repo.name} … `)
  let dir
  try {
    dir = ensureCheckout(repo)
  } catch (error) {
    process.stderr.write('checkout failed\n')
    results.push({ name: repo.name, error: `checkout failed: ${error.message}` })
    continue
  }
  const result = measure(repo, dir)
  if (!result.error && result.filesAnalyzed === 0) {
    // Zero files means the harness or the tool is broken; recording it as a score
    // would bake the very false green this benchmark exists to catch.
    result.error = 'analyzed 0 files — check the sparse checkout and the repo config'
  }
  results.push(result)
  process.stderr.write(
    result.error
      ? `${result.error}\n`
      : `${result.filesAnalyzed} file(s), ${result.findings} finding(s), ${result.score} (${result.grade}), ${result.elapsedMs}ms\n`,
  )
}

const broken = results.filter((result) => result.error)
const payload = { corpusRefs: Object.fromEntries(repos.map((r) => [r.name, r.ref])), results }
writeFileSync(resultsPath, `${JSON.stringify(payload, null, 2)}\n`)

if (broken.length > 0) {
  console.error(
    `\n${broken.length} repo(s) produced no usable measurement:\n${broken
      .map((result) => `  - ${result.name}: ${result.error}`)
      .join('\n')}`,
  )
  process.exit(1)
}

if (updateBaseline) {
  writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`)
  console.log(`\nBaseline updated: bench/baseline.json (${results.length} repo(s)).`)
  process.exit(0)
}

if (!existsSync(baselinePath)) {
  console.error('\nNo bench/baseline.json yet — run `pnpm bench --update-baseline` to record one.')
  process.exit(1)
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
const diff = formatDiff(baseline.results, results)

if (!diff) {
  console.log('\nNo change vs baseline.')
  process.exit(0)
}
console.log(`\n${diff.markdown}`)
console.log(
  '\nReview each row: a drop in `filesAnalyzed` is a narrowed scan, and a drop in findings without a rule change is signal loss.',
)
console.log('Accept with `pnpm bench --update-baseline`.')
// A narrowed scan is the one regression a score cannot show, so it fails the run.
process.exit(diff.signalLoss ? 1 : 0)
