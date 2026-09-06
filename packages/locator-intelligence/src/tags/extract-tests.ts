import type { AstNode } from '../parser.js'

/**
 * A `test()` declaration with the tags that apply to it.
 *
 * Playwright takes tags from two places — `@tag` tokens in the title and a
 * `{ tag: [...] }` details argument — and a `test.describe` tag applies to every
 * test inside it. `effectiveTags` is what `--grep` will actually see, which is
 * the only number worth reporting.
 */
export interface TestDeclaration {
  /** Static title text, or the static parts of a dynamic template literal. */
  title: string
  /** True when the title contains `${}` — the full title is not knowable statically. */
  dynamicTitle: boolean
  /** Tags written on this test itself, without the leading `@`, deduped and sorted. */
  ownTags: string[]
  /** `ownTags` plus every enclosing `test.describe` tag. */
  effectiveTags: string[]
  line: number
  column: number
}

/** Modifiers that still declare a test (as opposed to in-body `test.skip()`). */
const TEST_MODIFIERS = new Set(['only', 'skip', 'fixme', 'fail', 'slow'])
/** Modifiers that still declare a describe block. */
const DESCRIBE_MODIFIERS = new Set(['only', 'skip', 'fixme', 'serial', 'parallel'])

const TAG_IN_TITLE = /@\S+/g

interface Loc {
  start: { line: number; column: number }
}

function chainOf(callee: AstNode | undefined): string[] | null {
  const parts: string[] = []
  let current = callee
  while (current) {
    if (current.type === 'Identifier' && typeof current.name === 'string') {
      parts.unshift(current.name)
      return parts
    }
    if (current.type !== 'MemberExpression' || current.computed === true) {
      return null
    }
    const property = current.property as AstNode | undefined
    if (!property || property.type !== 'Identifier' || typeof property.name !== 'string') {
      return null
    }
    parts.unshift(property.name)
    current = current.object as AstNode | undefined
  }
  return null
}

function isFunctionNode(node: AstNode | undefined): boolean {
  return (
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionExpression' ||
    node?.type === 'FunctionDeclaration'
  )
}

/** Reads a title argument: a string literal, or the static parts of a template. */
function readTitle(arg: AstNode | undefined): { title: string; dynamic: boolean } | null {
  if (!arg) {
    return null
  }
  if (arg.type === 'Literal' && typeof arg.value === 'string') {
    return { title: arg.value, dynamic: false }
  }
  if (arg.type === 'TemplateLiteral') {
    const quasis = (arg.quasis as Array<{ value: { cooked: string | null } }>) ?? []
    const expressions = (arg.expressions as unknown[]) ?? []
    // The interpolations are unknowable; join the static runs with a space so a
    // tag never accidentally fuses with adjacent text.
    const title = quasis.map((quasi) => quasi.value.cooked ?? '').join(' ')
    return { title, dynamic: expressions.length > 0 }
  }
  return null
}

function normalizeTag(raw: string): string | null {
  const trimmed = raw.trim()
  const body = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
  return body === '' ? null : body
}

function tagsFromTitle(title: string): string[] {
  const found = title.match(TAG_IN_TITLE)
  if (!found) {
    return []
  }
  const tags: string[] = []
  for (const raw of found) {
    const tag = normalizeTag(raw)
    if (tag) {
      tags.push(tag)
    }
  }
  return tags
}

/** Reads `{ tag: '@a' }` or `{ tag: ['@a', '@b'] }` from a details argument. */
function tagsFromDetails(arg: AstNode | undefined): string[] {
  if (!arg || arg.type !== 'ObjectExpression') {
    return []
  }
  const properties = (arg.properties as AstNode[]) ?? []
  const tags: string[] = []
  for (const property of properties) {
    if (property.type !== 'Property' || property.computed === true) {
      continue
    }
    const key = property.key as AstNode | undefined
    const name =
      key?.type === 'Identifier'
        ? (key.name as string)
        : key?.type === 'Literal' && typeof key.value === 'string'
          ? key.value
          : null
    if (name !== 'tag') {
      continue
    }
    const value = property.value as AstNode | undefined
    const literals: AstNode[] =
      value?.type === 'ArrayExpression' ? ((value.elements as AstNode[]) ?? []) : [value as AstNode]
    for (const element of literals) {
      const read = readTitle(element)
      if (!read || read.dynamic) {
        continue
      }
      const tag = normalizeTag(read.title)
      if (tag) {
        tags.push(tag)
      }
    }
  }
  return tags
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort()
}

type CallKind = 'test' | 'describe' | null

function classify(node: AstNode): CallKind {
  const chain = chainOf(node.callee as AstNode | undefined)
  if (!chain || chain[0] !== 'test') {
    return null
  }
  const rest = chain.slice(1)
  const args = (node.arguments as AstNode[]) ?? []

  if (rest[0] === 'describe') {
    const modifiers = rest.slice(1)
    if (!modifiers.every((part) => DESCRIBE_MODIFIERS.has(part))) {
      // `test.describe.configure({...})` and friends declare nothing.
      return null
    }
    return args.some(isFunctionNode) ? 'describe' : null
  }

  if (!rest.every((part) => TEST_MODIFIERS.has(part))) {
    return null
  }
  // `test.skip()` / `test.slow(condition, reason)` inside a body are modifiers,
  // not declarations: a declaration always has a title *and* a body function.
  const hasTitle = readTitle(args[0]) !== null
  return hasTitle && args.some(isFunctionNode) ? 'test' : null
}

function ownTagsOf(node: AstNode): string[] {
  const args = (node.arguments as AstNode[]) ?? []
  const title = readTitle(args[0])
  const fromTitle = title ? tagsFromTitle(title.title) : []
  // Playwright's details argument is the second positional argument.
  const fromDetails = tagsFromDetails(args[1])
  return sortedUnique([...fromTitle, ...fromDetails])
}

/**
 * Extracts every `test()` declaration with its effective tags.
 *
 * The walk is scoped rather than flat: a `test.describe` tag has to reach the
 * tests nested inside it, which a `walk()` visitor cannot see.
 */
export function extractTests(program: AstNode): TestDeclaration[] {
  const declarations: TestDeclaration[] = []

  const visit = (node: unknown, inherited: string[]): void => {
    if (node === null || typeof node !== 'object') {
      return
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child, inherited)
      }
      return
    }
    const candidate = node as AstNode
    if (typeof candidate.type !== 'string') {
      for (const key of Object.keys(candidate)) {
        if (key === 'loc' || key === 'range' || key === 'parent') continue
        visit(candidate[key], inherited)
      }
      return
    }

    if (candidate.type === 'CallExpression') {
      const kind = classify(candidate)
      if (kind === 'describe') {
        const nested = sortedUnique([...inherited, ...ownTagsOf(candidate)])
        const args = (candidate.arguments as AstNode[]) ?? []
        for (const arg of args) {
          visit(arg, isFunctionNode(arg) ? nested : inherited)
        }
        visit(candidate.callee, inherited)
        return
      }
      if (kind === 'test') {
        const args = (candidate.arguments as AstNode[]) ?? []
        const title = readTitle(args[0])
        const ownTags = ownTagsOf(candidate)
        const loc = candidate.loc as Loc | undefined
        declarations.push({
          title: title?.title ?? '',
          dynamicTitle: title?.dynamic ?? false,
          ownTags,
          effectiveTags: sortedUnique([...inherited, ...ownTags]),
          line: loc?.start.line ?? 0,
          column: (loc?.start.column ?? 0) + 1,
        })
        for (const arg of args) {
          visit(arg, inherited)
        }
        visit(candidate.callee, inherited)
        return
      }
    }

    for (const key of Object.keys(candidate)) {
      if (key === 'loc' || key === 'range' || key === 'parent') continue
      visit(candidate[key], inherited)
    }
  }

  visit(program, [])
  declarations.sort((a, b) => a.line - b.line || a.column - b.column)
  return declarations
}
