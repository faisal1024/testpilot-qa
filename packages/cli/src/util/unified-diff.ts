/**
 * Renders a minimal unified diff between two texts. TestPilot's fixes preserve
 * line count (no lines added or removed), so a line-index-aligned diff is exact:
 * lines that differ become `-`/`+` pairs, grouped into hunks with a few lines of
 * context. Returns an empty string when the texts are identical.
 */
export function renderUnifiedDiff(
  path: string,
  before: string,
  after: string,
  context = 2,
): string {
  if (before === after) return ''
  const a = before.split('\n')
  const b = after.split('\n')
  // This renderer assumes equal line counts (TestPilot's fixes never add/remove
  // lines). If that ever changes, fall back to a whole-file replacement hunk.
  if (a.length !== b.length) {
    return wholeFileDiff(path, a, b)
  }

  const changed: number[] = []
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) changed.push(i)
  }
  if (changed.length === 0) return ''

  const lines: string[] = [`--- a/${path}`, `+++ b/${path}`]
  for (const [start, end] of groupHunks(changed, context, a.length)) {
    const count = end - start + 1
    lines.push(`@@ -${start + 1},${count} +${start + 1},${count} @@`)
    for (let i = start; i <= end; i++) {
      if (a[i] === b[i]) {
        lines.push(` ${a[i]}`)
      } else {
        lines.push(`-${a[i]}`)
        lines.push(`+${b[i]}`)
      }
    }
  }
  return lines.join('\n')
}

/** Groups changed line indices into [start, end] hunks padded by `context` lines. */
function groupHunks(changed: number[], context: number, total: number): Array<[number, number]> {
  const hunks: Array<[number, number]> = []
  for (const index of changed) {
    const start = Math.max(0, index - context)
    const end = Math.min(total - 1, index + context)
    const last = hunks[hunks.length - 1]
    if (last && start <= last[1] + 1) {
      last[1] = Math.max(last[1], end)
    } else {
      hunks.push([start, end])
    }
  }
  return hunks
}

/** Fallback for the (currently unused) unequal-line-count case. */
function wholeFileDiff(path: string, a: string[], b: string[]): string {
  const lines = [`--- a/${path}`, `+++ b/${path}`, `@@ -1,${a.length} +1,${b.length} @@`]
  for (const line of a) lines.push(`-${line}`)
  for (const line of b) lines.push(`+${line}`)
  return lines.join('\n')
}
