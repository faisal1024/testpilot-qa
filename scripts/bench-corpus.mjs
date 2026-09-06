#!/usr/bin/env node
/**
 * Runs the built CLI against pinned commits of real open-source Playwright suites and
 * compares the result to a committed baseline.
 *
 * This exists because every discovery defect found during Phase 9 was caught by hand,
 * one at a time, on fixtures invented after the fact. A rule or discovery change that
 * quietly halves what gets analyzed on a real repo is invisible to unit tests — this
 * is the tool's own no-regression gate, the same thing `--baseline` gives its users.
 *
 *   pnpm bench                                    # compare against bench/baseline.json
 *   pnpm bench --update-baseline --reason "..."   # record, with the reason on the record
 *   pnpm bench --only cal.com                     # one repo (comparison only)
 *
 * Requires a prior `pnpm -r build` and network access on first run; clones are cached
 * under .bench-cache/ (gitignored) and reused.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatDiff, refsChanged, validateResults } from './bench-compare.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const cacheDir = join(root, '.bench-cache')
const corpus = JSON.parse(readFileSync(join(root, 'bench', 'corpus.json'), 'utf8'))
const baselinePath = join(root, 'bench', 'baseline.json')
const resultsPath = join(root, 'bench', 'results.json')
const cli = join(root, 'packages', 'cli', 'dist', 'cli.js')

const args = process.argv.slice(2)
const updateBaseline = args.includes('--update-baseline')
const flagValue = (flag) => {
  const index = args.indexOf(flag)
  if (index === -1) return null
  const value = args[index + 1]
  if (!value || value.startsWith('--')) die(`${flag} needs a value.`)
  return value
}

function die(message) {
  console.error(message)
  process.exit(1)
}

const only = flagValue('--only')
const reason = flagValue('--reason')

function run(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  })
}

/** Cache identity: re-checkout when the pin *or* what we ask for from it changes. */
const stampOf = (repo) =>
  createHash('sha256')
    .update(JSON.stringify([repo.ref, repo.sparse, repo.cwd ?? null]))
    .digest('hex')

/** Blobless + sparse clone: the test trees only, at a pinned commit. */
function ensureCheckout(repo) {
  const dir = join(cacheDir, repo.name)
  const stampPath = join(dir, '.bench-stamp')
  const stamp = stampOf(repo)
  if (existsSync(stampPath) && readFileSync(stampPath, 'utf8').trim() === stamp) return dir

  if (!existsSync(join(dir, '.git'))) {
    mkdirSync(dir, { recursive: true })
    run('git', ['init', '--quiet'], { cwd: dir })
    run('git', ['remote', 'add', 'origin', repo.url], { cwd: dir })
    run('git', ['config', 'core.sparseCheckout', 'true'], { cwd: dir })
  }
  run('git', ['sparse-checkout', 'set', '--no-cone', ...repo.sparse], { cwd: dir })
  run('git', ['fetch', '--quiet', '--depth', '1', '--filter=blob:none', 'origin', repo.ref], {
    cwd: dir,
  })
  run('git', ['checkout', '--quiet', repo.ref], { cwd: dir })
  writeFileSync(stampPath, `${stamp}\n`)
  return dir
}

/**
 * A sparse pattern that matches nothing fails silently and quietly shrinks the corpus,
 * so every pattern must earn its place.
 */
function deadPatterns(repo, dir) {
  const tracked = run('git', ['ls-files'], { cwd: dir }).split('\n').filter(Boolean)
  return repo.sparse.filter((pattern) => {
    const needle = pattern.replace(/^\//, '').replace(/\/$/, '')
    if (pattern.includes('*')) {
      const prefix = needle.split('*')[0]
      return !tracked.some((file) => file.startsWith(prefix))
    }
    return !tracked.some((file) => file === needle || file.startsWith(`${needle}/`))
  })
}

function analyze(dir, extraArgs = []) {
  let raw = ''
  let exitCode = 0
  try {
    raw = run('node', [cli, 'analyze', '--cwd', dir, '--json', '--no-color', ...extraArgs])
  } catch (error) {
    // A non-zero exit is a legitimate outcome (a gate, or a discovery failure) — the
    // report still went to stdout, and its absence is itself the finding.
    exitCode = error.status ?? 1
    raw = error.stdout ?? ''
  }
  try {
    return { report: JSON.parse(raw), exitCode }
  } catch {
    return { report: null, exitCode }
  }
}

/** What the CLI reports, reduced to the numbers a regression would move. */
function measure(repo, dir) {
  // Some suites live in a workspace package whose Playwright config is deeper than the
  // one-level lookup; a contributor would run from that package, so the benchmark does.
  const cwd = repo.cwd ? join(dir, repo.cwd) : dir
  const started = Date.now()
  const { report, exitCode } = analyze(cwd)
  const elapsedMs = Date.now() - started
  if (!report) return { name: repo.name, error: 'analyze produced no JSON report', exitCode }

  const byRule = {}
  for (const finding of report.findings ?? []) {
    byRule[finding.ruleId] = (byRule[finding.ruleId] ?? 0) + 1
  }
  const warnings = {}
  for (const warning of report.warnings ?? []) {
    warnings[warning.code] = (warnings[warning.code] ?? 0) + 1
  }

  // Discovery escaping the checkout means we are measuring some other tree entirely —
  // it happened on the first run of this harness, silently.
  const rootDir = report.rootDir ?? ''
  const inside =
    resolve(rootDir).startsWith(`${resolve(dir)}${sep}`) || resolve(rootDir) === resolve(dir)

  // The plan's headline metric is "default discovery finds the suite", which a per-repo
  // `cwd` would quietly answer for us — so ask from the repo root as well.
  const fromRoot = repo.cwd ? (analyze(dir).report?.summary?.filesAnalyzed ?? 0) : null

  return {
    name: repo.name,
    exitCode,
    filesAnalyzed: report.summary?.filesAnalyzed ?? 0,
    parseErrors: report.summary?.filesWithParseErrors ?? 0,
    findings: report.summary?.findings ?? 0,
    score: report.score?.score ?? null,
    // Derived from `score`; recorded for readability, never compared.
    grade: report.score?.grade ?? null,
    callSites: report.score?.callSites ?? 0,
    byRule: Object.fromEntries(Object.entries(byRule).sort(([a], [b]) => a.localeCompare(b))),
    warnings: Object.fromEntries(Object.entries(warnings).sort(([a], [b]) => a.localeCompare(b))),
    discovery: {
      testDir: report.discovery?.testDir ?? null,
      include: report.discovery?.include ?? null,
    },
    filesFromRepoRoot: fromRoot,
    rootDir: inside ? undefined : rootDir,
    rootOutsideCheckout: !inside,
    // Recorded, never compared: it is machine-dependent and would make every diff noisy.
    elapsedMs,
  }
}

if (!existsSync(cli)) die(`Built CLI not found at ${cli}. Run: pnpm -r build`)

if (only && updateBaseline) {
  die('--update-baseline runs the whole corpus: a partial baseline silently drops repos.')
}
if (updateBaseline && !reason) {
  die('--update-baseline requires --reason "why these numbers moved" — it is recorded in the file.')
}

const repos = corpus.repos.filter((repo) => !only || repo.name === only)
if (repos.length === 0) {
  die(`--only ${only} matched no repo. Known: ${corpus.repos.map((r) => r.name).join(', ')}`)
}

const results = []
for (const repo of repos) {
  process.stderr.write(`• ${repo.name} … `)
  let dir
  try {
    dir = ensureCheckout(repo)
  } catch (error) {
    const detail = `${error.message}${error.stderr ? `\n${error.stderr}` : ''}`
    process.stderr.write('checkout failed\n')
    results.push({ name: repo.name, error: `checkout failed: ${detail}` })
    continue
  }
  const dead = deadPatterns(repo, dir)
  if (dead.length > 0) {
    process.stderr.write(`dead sparse pattern(s): ${dead.join(', ')}\n`)
    results.push({
      name: repo.name,
      error: `sparse pattern(s) matched nothing: ${dead.join(', ')}`,
    })
    continue
  }
  const result = measure(repo, dir)
  results.push(result)
  process.stderr.write(
    result.error
      ? `${result.error}\n`
      : `${result.filesAnalyzed} file(s), ${result.callSites} call-site(s), ${result.findings} finding(s), ${result.score} (${result.grade}), ${result.elapsedMs}ms\n`,
  )
}

const currentRefs = Object.fromEntries(repos.map((repo) => [repo.name, repo.ref]))
const payload = { corpusRefs: currentRefs, results }
writeFileSync(resultsPath, `${JSON.stringify(payload, null, 2)}\n`)

const problems = validateResults(results)
if (problems.length > 0) {
  console.error(`\n${problems.length} repo(s) produced no usable measurement:`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

if (updateBaseline) {
  const recorded = {
    recordedAt: new Date().toISOString().slice(0, 10),
    reason,
    ...payload,
  }
  writeFileSync(baselinePath, `${JSON.stringify(recorded, null, 2)}\n`)
  console.log(`\nBaseline updated (${results.length} repo(s)): ${reason}`)
  process.exit(0)
}

if (!existsSync(baselinePath)) {
  die('\nNo bench/baseline.json yet — run `pnpm bench --update-baseline --reason "..."`.')
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
const moved = refsChanged(baseline.corpusRefs, currentRefs)
if (moved.length > 0 && !only) {
  console.error('\nThe pinned corpus moved, so any diff is upstream churn, not a tool change:')
  for (const entry of moved) console.error(`  - ${entry.name}: ${entry.before} → ${entry.after}`)
  console.error('Re-record with `pnpm bench --update-baseline --reason "corpus repinned: …"`.')
  process.exit(1)
}

const diff = formatDiff(baseline.results, results)
if (!diff) {
  console.log('\nNo change vs baseline.')
  process.exit(0)
}
console.log(`\n${diff.markdown}`)
console.log(
  '\n`filesAnalyzed`, `callSites` and `parseErrors` are the gate: they evidence that the analysis happened.',
)
console.log(
  'Findings and per-rule counts are reporting — a precision fix moves those and leaves the gate untouched.',
)
console.log('Accept with `pnpm bench --update-baseline --reason "..."`.')
// A narrowed scan is the one regression a score cannot show, so it fails the run.
process.exit(diff.signalLoss ? 1 : 0)
