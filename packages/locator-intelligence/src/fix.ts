import { type AstNode, parseSource } from './parser.js'
import { walk } from './parser.js'

/** The kind of mechanical fix applied. Kept tiny and conservative on purpose. */
export type FixKind = 'text-engine-to-get-by-text'

export interface FixEdit {
  kind: FixKind
  /** 1-based line of the rewritten call. */
  line: number
  /** The original call expression text. */
  before: string
  /** The rewritten call expression text. */
  after: string
}

export interface FileFixResult {
  /** Transformed source. Strictly equal to the input when there are no fixes. */
  output: string
  fixes: FixEdit[]
}

interface RangeEdit {
  start: number
  end: number
  replacement: string
}

interface RangedNode extends AstNode {
  range: [number, number]
  loc: { start: { line: number; column: number } }
}

function isRanged(node: AstNode | undefined): node is RangedNode {
  return (
    !!node &&
    Array.isArray((node as { range?: unknown }).range) &&
    !!(node as { loc?: unknown }).loc
  )
}

/**
 * For a `locator()` selector string, returns the plain text value when (and only
 * when) it is an unambiguous `text=<plain>` selector that is **behavior-identical**
 * to `getByText(<plain>)` — Playwright's string `getByText` does the same
 * case-insensitive, trimmed, substring match as the `text=` engine.
 *
 * Deliberately conservative — returns `null` (skip) for anything that could change
 * meaning or can't be safely re-quoted:
 *  - `text="exact"` / `text='exact'` (quoted = exact match) and `text=/re/` (regex);
 *  - chained selectors containing `>>`;
 *  - values with quotes, backslashes, or newlines (unsafe to reconstruct as a literal).
 */
export function plainTextSelectorValue(selector: string): string | null {
  if (!selector.startsWith('text=')) return null
  const value = selector.slice('text='.length)
  if (value.length === 0) return null
  if (/^["'/]/.test(value)) return null
  if (value.includes('>>')) return null
  if (/['"`\\\n\r]/.test(value)) return null
  return value
}

/**
 * Computes safe, mechanical fixes for a single file. Pure: parses the source and
 * returns the rewritten text plus a description of each change. On a parse error
 * it throws (the caller decides how to report); it never partially rewrites.
 *
 * The only fix today: `x.locator('text=Foo')` → `x.getByText('Foo')`. The rewrite
 * preserves line count (no newlines added/removed), so it diffs cleanly and is
 * idempotent (the result no longer matches the `locator('text=…')` pattern).
 */
export function computeFixes(code: string, filePath: string): FileFixResult {
  const ast = parseSource(code, filePath)
  const edits: RangeEdit[] = []
  const fixes: FixEdit[] = []

  walk(ast, (node) => {
    if (node.type !== 'CallExpression') return
    const callee = node.callee as AstNode | undefined
    if (!callee || callee.type !== 'MemberExpression' || callee.computed) return
    const property = callee.property as AstNode | undefined
    if (!property || property.type !== 'Identifier' || property.name !== 'locator') return
    const args = node.arguments as AstNode[] | undefined
    if (!args || args.length !== 1) return
    const arg = args[0]
    if (!arg || arg.type !== 'Literal' || typeof arg.value !== 'string') return

    const value = plainTextSelectorValue(arg.value)
    if (value === null) return
    if (!isRanged(property) || !isRanged(arg) || !isRanged(node)) return

    const propertyEdit: RangeEdit = {
      start: property.range[0],
      end: property.range[1],
      replacement: 'getByText',
    }
    const argEdit: RangeEdit = { start: arg.range[0], end: arg.range[1], replacement: `'${value}'` }
    edits.push(propertyEdit, argEdit)

    const base = node.range[0]
    const original = code.slice(node.range[0], node.range[1])
    const after = applyEdits(original, [
      {
        start: propertyEdit.start - base,
        end: propertyEdit.end - base,
        replacement: propertyEdit.replacement,
      },
      { start: argEdit.start - base, end: argEdit.end - base, replacement: argEdit.replacement },
    ])
    fixes.push({
      kind: 'text-engine-to-get-by-text',
      line: node.loc.start.line,
      before: original,
      after,
    })
  })

  return { output: applyEdits(code, edits), fixes }
}

/** Applies non-overlapping range edits to `source` (right-to-left, so offsets hold). */
function applyEdits(source: string, edits: RangeEdit[]): string {
  let out = source
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.replacement + out.slice(edit.end)
  }
  return out
}
