import { describe, expect, it } from 'vitest'
import { renderUnifiedDiff } from '../src/util/unified-diff.js'

describe('renderUnifiedDiff', () => {
  it('returns empty string for identical input', () => {
    expect(renderUnifiedDiff('a.ts', 'x\ny\n', 'x\ny\n')).toBe('')
  })

  it('emits a/b headers and a -/+ pair for a changed line', () => {
    const out = renderUnifiedDiff('tests/a.spec.ts', 'one\ntwo\nthree\n', 'one\nTWO\nthree\n')
    expect(out).toContain('--- a/tests/a.spec.ts')
    expect(out).toContain('+++ b/tests/a.spec.ts')
    expect(out).toContain('-two')
    expect(out).toContain('+TWO')
    expect(out).toContain(' one') // context line carried with a leading space
  })

  it('splits distant changes into separate hunks', () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n')
    const after = before
      .split('\n')
      .map((l, i) => (i === 1 || i === 17 ? `${l} CHANGED` : l))
      .join('\n')
    const out = renderUnifiedDiff('a.ts', before, after)
    const hunks = [...out.matchAll(/^@@ /gm)]
    expect(hunks).toHaveLength(2) // the two changes are far apart → two hunks
  })

  it('uses 1-based line numbers in the hunk header', () => {
    const out = renderUnifiedDiff('a.ts', 'a\nb\nc\n', 'a\nB\nc\n', 0)
    // change on line 2, zero context → @@ -2,1 +2,1 @@
    expect(out).toContain('@@ -2,1 +2,1 @@')
  })
})
