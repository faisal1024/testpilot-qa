/**
 * Pure comparison and validation for `pnpm bench`, separated from the runner so it can
 * be tested without cloning anything.
 *
 * The gate's job is to catch **signal loss** — the tool quietly analyzing less than it
 * used to — while letting deliberate precision work through. Those look identical if
 * you only watch `findings`: `findings` is by construction the sum of `byRule`, so any
 * drop in findings always moves a rule row, and "did a rule row move" carries no
 * information about intent.
 *
 * So the gate watches the **evidence that the analysis happened at all**, which is
 * orthogonal to rule precision: how many files were opened, how many locator call
 * sites were extracted from them, and how many failed to parse. Removing false
 * positives moves findings and leaves those untouched; a broken rule, a narrowed
 * discovery, or a parser regression moves them.
 */

/** Metrics rendered in the diff table. `elapsedMs`/`grade` are excluded on purpose. */
export const COMPARED_METRICS = [
  'filesAnalyzed',
  'parseErrors',
  'findings',
  'score',
  'callSites',
  'exitCode',
]

/**
 * Metrics whose movement in the stated direction means we are seeing less than we did.
 * These, not `findings`, are the gate.
 */
export const EVIDENCE_METRICS = {
  filesAnalyzed: 'decrease',
  callSites: 'decrease',
  parseErrors: 'increase',
}

/** Discovery sources that mean a real config was read; anything else is a fallback. */
const INFORMED_SOURCES = new Set(['playwright-config', 'testpilot-config', 'mixed'])

import picomatch from 'picomatch'

const warningCounts = (result) => result?.warnings ?? {}

/**
 * Warnings that mean the *checkout* is wrong — a missing test root, a config we could
 * not read. Recording one enshrines a harness bug as the expected state.
 *
 * Warnings about the repository itself (it has a page-object layer we did not analyze)
 * are legitimate properties of the corpus and may be recorded.
 */
const HARNESS_WARNINGS = new Set([
  'no-files-matched',
  'test-root-missing',
  'playwright-config-partial',
  'playwright-config-ignored',
  'unknown-rule',
])

/**
 * Rows describing how one repo's measurement moved: `{ metric, before, after }`.
 * Empty when nothing meaningful changed.
 */
export function diffRepo(before, after) {
  if (!before) return [{ metric: '(new repo)', before: '—', after: after.name }]
  if (!after) return [{ metric: '(missing from run)', before: before.name, after: '—' }]

  const rows = []
  if (before.filesFromRepoRoot !== after.filesFromRepoRoot) {
    rows.push({
      metric: 'filesFromRepoRoot',
      before: before.filesFromRepoRoot,
      after: after.filesFromRepoRoot,
    })
  }
  for (const metric of COMPARED_METRICS) {
    if (before[metric] !== after[metric]) {
      rows.push({ metric, before: before[metric], after: after[metric] })
    }
  }
  for (const key of ['filesAnalyzed', 'helperFiles']) {
    const wasCount = before.withHelpers?.[key] ?? null
    const nowCount = after.withHelpers?.[key] ?? null
    if (wasCount !== nowCount) {
      rows.push({ metric: `withHelpers.${key}`, before: wasCount, after: nowCount })
    }
  }
  for (const key of ['testDir', 'include']) {
    const wasSource = before.discovery?.[key] ?? null
    const nowSource = after.discovery?.[key] ?? null
    if (wasSource !== nowSource) {
      rows.push({ metric: `discovery.${key}`, before: wasSource, after: nowSource })
    }
  }
  const rules = new Set([...Object.keys(before.byRule ?? {}), ...Object.keys(after.byRule ?? {})])
  for (const rule of [...rules].sort()) {
    const wasCount = before.byRule?.[rule] ?? 0
    const nowCount = after.byRule?.[rule] ?? 0
    if (wasCount !== nowCount) rows.push({ metric: rule, before: wasCount, after: nowCount })
  }
  // Counted, not de-duplicated: a second missing test root must not hide behind the
  // first one's code already being in the list.
  const codes = new Set([
    ...Object.keys(warningCounts(before)),
    ...Object.keys(warningCounts(after)),
  ])
  for (const code of [...codes].sort()) {
    const wasCount = warningCounts(before)[code] ?? 0
    const nowCount = warningCounts(after)[code] ?? 0
    if (wasCount !== nowCount) {
      rows.push({ metric: `warning:${code}`, before: wasCount, after: nowCount })
    }
  }
  return rows
}

/**
 * True when the rows show the tool seeing less than it did. Deliberately indifferent to
 * `findings` and per-rule counts — those move for good reasons too, and the reviewer
 * reads the table.
 */
export function isSignalLoss(rows) {
  return rows.some((row) => {
    if (row.metric === '(missing from run)') return true
    const direction = EVIDENCE_METRICS[row.metric]
    if (direction === 'decrease') return row.after < row.before
    if (direction === 'increase') return row.after > row.before
    // A repo that starts failing is loss; one that stops failing is a fix.
    if (row.metric === 'exitCode') return row.after !== 0 && row.after !== row.before
    if (row.metric.startsWith('discovery.')) {
      // Informed → guessing, or informed → nothing recorded at all.
      return INFORMED_SOURCES.has(row.before) && !INFORMED_SOURCES.has(row.after)
    }
    // Default discovery finding fewer files is the plan's headline metric regressing.
    if (row.metric === 'filesFromRepoRoot') return row.after < row.before
    // The helper layer narrowing is the same class of loss, on the path a
    // content-based admission gate makes easiest to break silently.
    if (row.metric.startsWith('withHelpers.')) return row.after < row.before
    // A warning that starts appearing (or appears more often) is the tool telling us it
    // could not see something.
    if (row.metric.startsWith('warning:')) return row.after > row.before
    return false
  })
}

/**
 * Problems that make a measurement unfit to record as a reference, whichever side
 * caused them. A baseline that accepts these enshrines the false green the benchmark
 * exists to catch.
 */
export function validateResults(results, { recording = true } = {}) {
  const problems = []
  for (const result of results) {
    if (result.error) {
      problems.push(`${result.name}: ${result.error}`)
      continue
    }
    if (result.filesAnalyzed === 0) {
      problems.push(`${result.name}: analyzed 0 files — check the sparse checkout and the config`)
    }
    if (result.rootOutsideCheckout) {
      problems.push(
        `${result.name}: discovery anchored at ${result.rootDir}, outside the checkout — the corpus is not measuring this repo`,
      )
    }
    // Only fatal when recording. On a comparison run a new warning is very likely the
    // *tool* regressing, and it must reach the diff table and the gate rather than
    // aborting with a message that blames the checkout.
    if (recording) {
      const codes = Object.keys(warningCounts(result)).filter((code) => HARNESS_WARNINGS.has(code))
      if (codes.length > 0) {
        problems.push(
          `${result.name}: the run reported ${codes.join(', ')} — fix the checkout rather than recording the warning as expected`,
        )
      }
    }
  }
  return problems
}

/**
 * Sparse patterns that matched none of the files the checkout actually materialized.
 * A dead pattern silently shrinks the corpus, and the shrinkage is invisible on a
 * *new* corpus entry — there is no baseline for it to fall short of.
 */
export function deadPatterns(patterns, materialized) {
  return patterns.filter((pattern) => {
    const needle = pattern.replace(/^\//, '').replace(/\/$/, '')
    if (pattern.includes('*')) {
      // Non-cone patterns are gitignore-style: they match at any depth.
      const isMatch = picomatch([needle, `**/${needle}`], { dot: true })
      return !materialized.some((file) => isMatch(file))
    }
    return !materialized.some(
      (file) =>
        file === needle ||
        file.startsWith(`${needle}/`) ||
        file.endsWith(`/${needle}`) ||
        file.includes(`/${needle}/`),
    )
  })
}

/**
 * A rule that fired in every repo that recorded it and now fires nowhere, with no new
 * rule id to account for it. Findings are deliberately not gated — but a rule going
 * completely silent corpus-wide is not calibration, and it has no false-positive
 * surface beyond a rule split, which the id check excludes.
 */
export function silencedRules(baselineResults, results) {
  const nowByName = new Map(results.map((result) => [result.name, result]))
  const beforeIds = new Set()
  const afterIds = new Set()
  for (const before of baselineResults ?? []) {
    const after = nowByName.get(before.name)
    if (!after) return { rules: [], newIds: [] }
    for (const [rule, count] of Object.entries(before.byRule ?? {})) {
      if (count > 0) beforeIds.add(rule)
    }
    for (const [rule, count] of Object.entries(after.byRule ?? {})) {
      if (count > 0) afterIds.add(rule)
    }
  }
  return {
    rules: [...beforeIds].filter((rule) => !afterIds.has(rule)).sort(),
    // A split introduces new ids. That makes silence explicable, so it is reported
    // rather than gated — bailing out entirely would switch the check off for every
    // rule during exactly the phase that introduces new ids.
    newIds: [...afterIds].filter((rule) => !beforeIds.has(rule)).sort(),
  }
}

/** Renders the whole comparison as Markdown, or `null` when nothing moved. */
/**
 * @param {object} [options]
 * @param {boolean} [options.corpusWide] Whether `results` covers the whole corpus.
 *   `--only` runs a subset, where "silent everywhere" cannot be concluded.
 */
export function formatDiff(baselineResults, results, { corpusWide = true } = {}) {
  const baseByName = new Map((baselineResults ?? []).map((result) => [result.name, result]))
  const nowByName = new Map(results.map((result) => [result.name, result]))
  const names = [...new Set([...baseByName.keys(), ...nowByName.keys()])]

  const sections = []
  let signalLoss = false
  for (const name of names) {
    const rows = diffRepo(baseByName.get(name), nowByName.get(name))
    if (rows.length === 0) continue
    const lost = isSignalLoss(rows)
    if (lost) signalLoss = true
    sections.push(
      [
        `\n#### ${name}${lost ? ' ⚠ signal loss' : ''}\n`,
        '| metric | baseline | now |',
        '|---|---:|---:|',
        ...rows.map((row) => `| ${row.metric} | ${row.before} | ${row.after} |`),
      ].join('\n'),
    )
  }
  if (corpusWide) {
    const { rules, newIds } = silencedRules(baselineResults, results)
    if (rules.length > 0) {
      // With new rule ids present this is very likely a split, so it is reported and
      // left for the reviewer rather than gated.
      const gated = newIds.length === 0
      if (gated) signalLoss = true
      sections.push(
        [
          `\n#### ${gated ? '⚠ signal loss — ' : ''}rule(s) silent across the whole corpus\n`,
          ...rules.map((rule) => `- \`${rule}\` fired in the baseline and fires nowhere now`),
          ...(gated
            ? []
            : [`\nNew rule id(s) appeared (${newIds.join(', ')}), so this reads as a rule split.`]),
        ].join('\n'),
      )
    }
  }
  if (sections.length === 0) return null
  return {
    markdown: ['### Corpus benchmark — changes vs baseline', ...sections].join('\n'),
    signalLoss,
  }
}

/** True when the pinned corpus moved, which makes any diff unattributable to the tool. */
export function refsChanged(baselineRefs, currentRefs) {
  const names = new Set([...Object.keys(baselineRefs ?? {}), ...Object.keys(currentRefs ?? {})])
  const moved = []
  for (const name of [...names].sort()) {
    const before = baselineRefs?.[name]
    const after = currentRefs?.[name]
    if (before !== after) moved.push({ name, before: before ?? '—', after: after ?? '—' })
  }
  return moved
}
