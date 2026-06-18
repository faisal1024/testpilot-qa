import { parse } from '@typescript-eslint/parser'

/** A parsed AST node. We treat the tree structurally rather than depend on full AST types. */
export interface AstNode {
  type: string
  [key: string]: unknown
}

/**
 * Parses TypeScript/JavaScript source into an ESTree-compatible AST (with
 * location and range info). Throws on syntax errors — callers handle per-file.
 */
export function parseSource(code: string, filePath: string): AstNode {
  const jsx = filePath.endsWith('x')
  return parse(code, {
    loc: true,
    range: true,
    comment: false,
    jsx,
  }) as unknown as AstNode
}

/**
 * Depth-first walk visiting every node that has a string `type`. Skips
 * non-structural keys (`loc`/`range`/`parent`) for speed and to avoid cycles.
 */
export function walk(node: unknown, visit: (node: AstNode) => void): void {
  if (node === null || typeof node !== 'object') {
    return
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      walk(child, visit)
    }
    return
  }
  const candidate = node as AstNode
  if (typeof candidate.type === 'string') {
    visit(candidate)
  }
  for (const key of Object.keys(candidate)) {
    if (key === 'loc' || key === 'range' || key === 'parent') {
      continue
    }
    walk(candidate[key], visit)
  }
}
