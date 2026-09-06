/**
 * Pure comparison for `pnpm bench`, separated from the runner so it can be tested
 * without cloning anything. The whole point of the benchmark is that a change which
 * quietly narrows what gets analyzed shows up — so that logic is worth pinning.
 */

/** Metrics compared numerically. `elapsedMs` is deliberately absent: it is machine-dependent. */
export const COMPARED_METRICS = ['filesAnalyzed', 'parseErrors', 'findings', 'score', 'callSites']

/**
 * Rows describing how one repo's measurement moved. Empty when nothing changed.
 * A row is `{ metric, before, after }`; callers render them.
 */
export function diffRepo(before, after) {
  if (!before) return [{ metric: '(new repo)', before: '—', after: after.name }]
  const rows = []
  for (const metric of COMPARED_METRICS) {
    if (before[metric] !== after[metric]) {
      rows.push({ metric, before: before[metric], after: after[metric] })
    }
  }
  const rules = new Set([...Object.keys(before.byRule ?? {}), ...Object.keys(after.byRule ?? {})])
  for (const rule of [...rules].sort()) {
    const wasCount = before.byRule?.[rule] ?? 0
    const nowCount = after.byRule?.[rule] ?? 0
    if (wasCount !== nowCount) rows.push({ metric: rule, before: wasCount, after: nowCount })
  }
  const wasWarnings = (before.warnings ?? []).join(',')
  const nowWarnings = (after.warnings ?? []).join(',')
  if (wasWarnings !== nowWarnings) {
    rows.push({
      metric: 'warnings',
      before: wasWarnings || '(none)',
      after: nowWarnings || '(none)',
    })
  }
  return rows
}

/**
 * True when a row is the shape that should stop a release: fewer files analyzed, or
 * fewer findings without an accompanying rule change. Both mean "we stopped seeing
 * something we used to see", which is exactly the regression a score cannot reveal.
 */
export function isSignalLoss(rows) {
  const files = rows.find((row) => row.metric === 'filesAnalyzed')
  if (files && files.after < files.before) return true
  const findings = rows.find((row) => row.metric === 'findings')
  const ruleRows = rows.filter(
    (row) => !COMPARED_METRICS.includes(row.metric) && row.metric !== 'warnings',
  )
  return Boolean(findings && findings.after < findings.before && ruleRows.length === 0)
}

/** Renders the whole comparison as Markdown, or `null` when nothing moved. */
export function formatDiff(baselineResults, results) {
  const byName = new Map((baselineResults ?? []).map((result) => [result.name, result]))
  const sections = []
  let signalLoss = false
  for (const result of results) {
    const rows = diffRepo(byName.get(result.name), result)
    if (rows.length === 0) continue
    if (isSignalLoss(rows)) signalLoss = true
    sections.push(
      [
        `\n#### ${result.name}${isSignalLoss(rows) ? ' ⚠ possible signal loss' : ''}\n`,
        '| metric | baseline | now |',
        '|---|---:|---:|',
        ...rows.map((row) => `| ${row.metric} | ${row.before} | ${row.after} |`),
      ].join('\n'),
    )
  }
  if (sections.length === 0) return null
  return {
    markdown: ['### Corpus benchmark — changes vs baseline', ...sections].join('\n'),
    signalLoss,
  }
}
