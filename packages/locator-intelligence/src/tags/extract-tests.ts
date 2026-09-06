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
  /**
   * False when the title is not a string at all (a variable, a call, a member
   * expression). Nothing about its tags can be read, so the vocabulary is
   * incomplete by at least this test — which the report has to say.
   */
  titleKnown: boolean
  /** Tags written on this test itself, without the leading `@`, deduped and sorted. */
  ownTags: string[]
  /** `ownTags` plus every enclosing `test.describe` tag. */
  effectiveTags: string[]
  /**
   * Effective tags written in a title — this test's or an enclosing describe's.
   * Provenance is effective, like `effectiveTags`: a describe-level
   * `{ tag: [...] }` is the most deliberate vocabulary there is, and keying it
   * to the describe rather than the tests would leave it invisible.
   */
  titleTags: string[]
  /** Effective tags from a `{ tag: [...] }` details argument. */
  detailTags: string[]
  /** Effective tags that appear in a form `--tag` can select. */
  anchoredTags: string[]
  /**
   * Tag entries on this test that could not be read statically — a spread, a
   * variable, or a template with interpolations. The test carries a tag we
   * cannot name, which the report has to say rather than drop. A describe's
   * unreadable entries are counted in {@link ExtractedTests.unreadableTagExpressions},
   * not here, so nothing is double-counted.
   */
  unreadableTags: number
  line: number
  column: number
}

/**
 * Modifiers that still declare a test (as opposed to in-body `test.skip()`).
 *
 * `slow` is deliberately absent: Playwright's `TestType.slow` has no
 * `(title, body)` overload, so `test.slow('x', fn)` is not a declaration.
 */
const TEST_MODIFIERS = new Set(['only', 'skip', 'fixme', 'fail'])
/** Modifiers that still declare a describe block. */
const DESCRIBE_MODIFIERS = new Set(['only', 'skip', 'fixme', 'serial', 'parallel'])

/** Playwright's own title-tag tokenization. */
const TAG_IN_TITLE = /@\S+/g
/**
 * The subset `--tag` can select: `@` preceded by whitespace or start-of-string.
 * In `notify user@smoke.example`, Playwright reads the tag `@smoke.example`
 * and we deliberately will not — so the report must be able to say which tags
 * are reachable and which only ever appear fused to a word.
 */
const ANCHORED_TAG_IN_TITLE = /(?<!\S)@\S+/g

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

interface ReadTitle {
  /** Static text, for display. */
  title: string
  /** True when the title contains `${...}`. */
  dynamic: boolean
  /**
   * The text safe to scan for tags. For a template literal this drops every
   * run of non-whitespace touching an interpolation, because such a run fuses
   * with the hole at runtime: ``test(`@smoke${x} y`)`` produces the tag
   * `@smokeX`, not `@smoke`, so reporting `@smoke` would name a tag no test
   * carries and `--tag smoke` would run nothing.
   */
  scannable: string
}

/** Reads a title argument: a string literal, or the static parts of a template. */
function readTitle(arg: AstNode | undefined): ReadTitle | null {
  if (!arg) {
    return null
  }
  if (arg.type === 'Literal' && typeof arg.value === 'string') {
    return { title: arg.value, dynamic: false, scannable: arg.value }
  }
  if (arg.type === 'TemplateLiteral') {
    const quasis = (arg.quasis as Array<{ value: { cooked: string | null } }>) ?? []
    const expressions = (arg.expressions as unknown[]) ?? []
    const parts = quasis.map((quasi) => quasi.value.cooked ?? '')
    const title = parts.join(' ')
    if (expressions.length === 0) {
      return { title, dynamic: false, scannable: title }
    }
    const scannable = parts
      .map((part, index) => {
        // A hole follows every quasi but the last, and precedes every one but the first.
        const trimmedEnd = index < parts.length - 1 ? part.replace(/\S+$/, '') : part
        return index > 0 ? trimmedEnd.replace(/^\S+/, '') : trimmedEnd
      })
      .join(' ')
    return { title, dynamic: true, scannable }
  }
  return null
}

function normalizeTag(raw: string): string | null {
  const trimmed = raw.trim()
  const body = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
  return body === '' ? null : body
}

function matchTags(text: string, pattern: RegExp): string[] {
  const found = text.match(pattern)
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

function tagsFromTitle(read: ReadTitle): { tags: string[]; anchored: string[] } {
  return {
    tags: matchTags(read.scannable, TAG_IN_TITLE),
    anchored: matchTags(read.scannable, ANCHORED_TAG_IN_TITLE),
  }
}

/** Reads `{ tag: '@a' }` or `{ tag: ['@a', '@b'] }` from a details argument. */
function tagsFromDetails(arg: AstNode | undefined): { tags: string[]; unreadable: number } {
  if (!arg || arg.type !== 'ObjectExpression') {
    return { tags: [], unreadable: 0 }
  }
  const properties = (arg.properties as AstNode[]) ?? []
  const tags: string[] = []
  let unreadable = 0
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
      if (element?.type === 'SpreadElement') {
        // `tag: [...COMMON, '@b']` — an unknown number of tags, at least one.
        unreadable += 1
        continue
      }
      const read = readTitle(element)
      if (!read || read.dynamic) {
        unreadable += 1
        continue
      }
      const tag = normalizeTag(read.title)
      if (tag) {
        tags.push(tag)
      } else {
        unreadable += 1
      }
    }
  }
  return { tags, unreadable }
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
  // A declaration is `(title, body)` or `(title, details, body)`; the in-body
  // modifiers are `test.skip(condition, reason)` and `test.skip(callback, reason)`.
  // The discriminator is the *first* argument, not whether the title is a string
  // literal: `test(name, fn)` inside a `for` loop is a real declaration, and
  // requiring a literal title dropped it — and every tag on it — silently.
  if (isFunctionNode(args[0])) {
    return null
  }
  return args.some(isFunctionNode) ? 'test' : null
}

interface OwnTags {
  all: string[]
  title: string[]
  details: string[]
  /**
   * Tags that appear somewhere in a form `--tag` can select. Details-argument
   * tags are always here: Playwright space-joins them onto the grep title.
   */
  anchored: string[]
  unreadable: number
}

const EMPTY_TAGS: OwnTags = { all: [], title: [], details: [], anchored: [], unreadable: 0 }

/** Folds an enclosing describe's tags into a test's own, preserving provenance. */
function mergeTags(inherited: OwnTags, own: OwnTags): OwnTags {
  return {
    all: sortedUnique([...inherited.all, ...own.all]),
    title: sortedUnique([...inherited.title, ...own.title]),
    details: sortedUnique([...inherited.details, ...own.details]),
    anchored: sortedUnique([...inherited.anchored, ...own.anchored]),
    // Only ever read off the declaration itself; a describe's unreadable
    // entries are counted when that describe is visited.
    unreadable: own.unreadable,
  }
}

function ownTagsOf(node: AstNode): OwnTags {
  const args = (node.arguments as AstNode[]) ?? []
  const title = readTitle(args[0])
  const fromTitle = title ? tagsFromTitle(title) : { tags: [], anchored: [] }
  // Playwright's details argument is the second positional argument.
  const fromDetails = tagsFromDetails(args[1])
  return {
    all: sortedUnique([...fromTitle.tags, ...fromDetails.tags]),
    title: sortedUnique(fromTitle.tags),
    details: sortedUnique(fromDetails.tags),
    anchored: sortedUnique([...fromTitle.anchored, ...fromDetails.tags]),
    unreadable: fromDetails.unreadable,
  }
}

export interface ExtractedTests {
  tests: TestDeclaration[]
  /**
   * Every unreadable `tag` entry in the file, on tests **and** describes.
   * File-level because a describe is not a declaration we report, and its
   * unreadable tags would otherwise vanish.
   */
  unreadableTagExpressions: number
}

/**
 * Extracts every `test()` declaration with its effective tags.
 *
 * The walk is scoped rather than flat: a `test.describe` tag has to reach the
 * tests nested inside it, which a `walk()` visitor cannot see.
 */
export function extractTests(program: AstNode): ExtractedTests {
  const declarations: TestDeclaration[] = []
  let unreadableTagExpressions = 0

  const visit = (node: unknown, inherited: OwnTags): void => {
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
        const own = ownTagsOf(candidate)
        unreadableTagExpressions += own.unreadable
        const nested = mergeTags(inherited, own)
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
        const own = ownTagsOf(candidate)
        unreadableTagExpressions += own.unreadable
        const effective = mergeTags(inherited, own)
        const loc = candidate.loc as Loc | undefined
        declarations.push({
          title: title?.title ?? '',
          dynamicTitle: title?.dynamic ?? false,
          titleKnown: title !== null,
          ownTags: own.all,
          titleTags: effective.title,
          detailTags: effective.details,
          anchoredTags: effective.anchored,
          unreadableTags: own.unreadable,
          effectiveTags: effective.all,
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

  visit(program, EMPTY_TAGS)
  declarations.sort((a, b) => a.line - b.line || a.column - b.column)
  return { tests: declarations, unreadableTagExpressions }
}
