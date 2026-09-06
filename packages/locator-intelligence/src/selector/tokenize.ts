import type {
  AttributeSelector,
  Combinator,
  ComplexSelector,
  CompoundSelector,
  ParsedSelector,
  PseudoSelector,
  SelectorPart,
} from './types.js'

/**
 * A one-pass Playwright/CSS selector tokenizer.
 *
 * It exists because every rule that reasoned about selectors with a regex was
 * wrong on the same three inputs: a quoted attribute value (`[href=".pdf"]`
 * read as a class), an escaped character (Tailwind's `.mt-1\.5` read as two),
 * and a selector list (`a, b` read as a descendant chain). Those are not exotic
 * — they are what real suites contain.
 *
 * The contract that matters: **it never guesses.** Anything it cannot parse is
 * reported in `unparsed` with `css: undefined`, and a rule that needs the parse
 * abstains. Under-reporting is the safe direction for a linter; a confident
 * wrong parse is not.
 */

/** Playwright's own engine names, plus the CSS/XPath defaults. */
const ENGINE_ALIASES: Record<string, SelectorPart['engine']> = {
  css: 'css',
  text: 'text',
  xpath: 'xpath',
  id: 'id',
  role: 'role',
  'data-testid': 'test-id',
  'data-test-id': 'test-id',
  'data-test': 'test-id',
  _react: 'react',
  _vue: 'vue',
  nth: 'other',
  visible: 'other',
  layout: 'other',
}

/** An engine prefix is `name=` at the very start, with a bare identifier name. */
const ENGINE_PREFIX = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s*=/
/** The same shape anchored at both ends: everything before a quote is just a prefix. */
const ENGINE_PREFIX_ONLY = /^\s*[a-zA-Z_][a-zA-Z0-9_:-]*\s*=\s*$/

const IDENTIFIER_START = /[a-zA-Z_ -￿\\-]/
const IDENTIFIER_CHAR = /[a-zA-Z0-9_ -￿\\-]/

class Cursor {
  index = 0
  constructor(readonly text: string) {}
  get done(): boolean {
    return this.index >= this.text.length
  }
  peek(offset = 0): string {
    return this.text[this.index + offset] ?? ''
  }
  take(): string {
    const char = this.text[this.index] ?? ''
    this.index += 1
    return char
  }
  skipSpaces(): boolean {
    const start = this.index
    while (!this.done && /\s/.test(this.peek())) {
      this.index += 1
    }
    return this.index > start
  }
}

/** Raised internally when the input cannot be parsed; callers turn it into `unparsed`. */
class SelectorSyntaxError extends Error {}

/**
 * Reads a CSS identifier, resolving backslash escapes.
 *
 * `.mt-1\.5` is one Tailwind class, not `mt-1` followed by a `.5` class — the
 * distinction the old regex could not make.
 */
function readEscape(cursor: Cursor): string {
  cursor.take() // '\\'
  if (cursor.done) {
    throw new SelectorSyntaxError('trailing backslash')
  }
  // CSS: a backslash followed by 1-6 hex digits is a code point, and one
  // optional whitespace character terminates it. Copying the next character
  // instead turned `.\\31 abc` (what CSS.escape emits for a name starting with
  // a digit) into a class literally named "31" plus an invented descendant.
  if (!/[0-9a-fA-F]/.test(cursor.peek())) {
    return cursor.take()
  }
  let hex = ''
  while (hex.length < 6 && /[0-9a-fA-F]/.test(cursor.peek())) {
    hex += cursor.take()
  }
  if (/\s/.test(cursor.peek())) {
    cursor.take()
  }
  const code = Number.parseInt(hex, 16)
  // Surrogates included: CSS maps them to U+FFFD, while `fromCodePoint` yields a
  // lone surrogate that then pairs with the next escape — two escapes became a
  // single emoji class name that no browser would ever match.
  if (
    !Number.isFinite(code) ||
    code === 0 ||
    code > 0x10ffff ||
    (code >= 0xd800 && code <= 0xdfff)
  ) {
    throw new SelectorSyntaxError('invalid escape')
  }
  return String.fromCodePoint(code)
}

function readIdentifier(cursor: Cursor): string {
  let out = ''
  while (!cursor.done) {
    const char = cursor.peek()
    if (char === '\\') {
      out += readEscape(cursor)
      continue
    }
    if (!IDENTIFIER_CHAR.test(char)) {
      break
    }
    out += cursor.take()
  }
  if (out === '') {
    throw new SelectorSyntaxError('expected an identifier')
  }
  return out
}

/** Reads a quoted string, resolving escapes. */
function readString(cursor: Cursor): string {
  const quote = cursor.take()
  let out = ''
  while (!cursor.done) {
    const char = cursor.take()
    if (char === '\\') {
      if (cursor.done) {
        throw new SelectorSyntaxError('trailing backslash in string')
      }
      out += cursor.take()
      continue
    }
    if (char === quote) {
      return out
    }
    out += char
  }
  throw new SelectorSyntaxError('unterminated string')
}

/** Reads `[name]`, `[name=value]`, `[name="value" i]`. */
function readAttribute(cursor: Cursor): AttributeSelector {
  cursor.take() // '['
  cursor.skipSpaces()
  // Lowercased here, once: four rules each remembering to do it is four
  // chances to forget. Class names stay case-sensitive (HTML standards mode).
  const name = readIdentifier(cursor).toLowerCase()
  cursor.skipSpaces()
  if (cursor.peek() === ']') {
    cursor.take()
    return { name }
  }
  let operator = ''
  while (!cursor.done && '^$*~|='.includes(cursor.peek())) {
    operator += cursor.take()
  }
  if (operator === '') {
    throw new SelectorSyntaxError('expected an attribute operator')
  }
  cursor.skipSpaces()
  const quote = cursor.peek()
  // A quoted value may contain anything — `.`, `#`, `[`, spaces. Reading it as
  // an opaque string is the whole reason `[href=".pdf"]` stopped being a class.
  const value =
    quote === '"' || quote === "'" ? readString(cursor) : readUnquotedAttributeValue(cursor)
  cursor.skipSpaces()
  let caseInsensitive: boolean | undefined
  if (/[iIsS]/.test(cursor.peek()) && cursor.peek(1) === ']') {
    caseInsensitive = cursor.take().toLowerCase() === 'i'
  }
  cursor.skipSpaces()
  if (cursor.peek() !== ']') {
    throw new SelectorSyntaxError('unterminated attribute selector')
  }
  cursor.take()
  return caseInsensitive === undefined
    ? { name, operator, value }
    : { name, operator, value, caseInsensitive }
}

function readUnquotedAttributeValue(cursor: Cursor): string {
  let out = ''
  while (!cursor.done && !/[\]\s]/.test(cursor.peek())) {
    if (cursor.peek() === '\\') {
      // The same decoder identifiers use — copying the next character made
      // `[a=\\41]` a value literally named "41".
      out += readEscape(cursor)
      continue
    }
    out += cursor.take()
  }
  if (out === '') {
    throw new SelectorSyntaxError('empty attribute value')
  }
  return out
}

/** Reads a balanced parenthesised argument, respecting nesting and strings. */
function readArgument(cursor: Cursor): string {
  cursor.take() // '('
  let depth = 1
  let out = ''
  while (!cursor.done) {
    const char = cursor.peek()
    if (char === '"' || char === "'") {
      const start = cursor.index
      readString(cursor)
      out += cursor.text.slice(start, cursor.index)
      continue
    }
    if (char === '(') {
      depth += 1
    } else if (char === ')') {
      depth -= 1
      if (depth === 0) {
        cursor.take()
        return out
      }
    }
    out += cursor.take()
  }
  throw new SelectorSyntaxError('unbalanced parentheses')
}

/**
 * Pseudo-classes whose argument is itself a selector list.
 *
 * Includes Playwright's positional ones (`:right-of`, `:near`, …): their
 * argument is a real selector, and reading it as opaque text made
 * `input:right-of(.label)` report "no classes" with a clean parse — the exact
 * silent-wrong-answer this module forbids.
 */
const SELECTOR_PSEUDOS = new Set([
  'has',
  'not',
  'is',
  'where',
  'matches',
  '-webkit-any',
  'light',
  'above',
  'below',
  'right-of',
  'left-of',
  // Shadow-DOM pseudos take a selector as well.
  'host',
  'host-context',
  'slotted',
])

/** Selector list followed by a trailing numeric argument. */
const SELECTOR_THEN_NUMBER_PSEUDOS = new Set(['nth-match', 'near'])

/**
 * `:nth-child(An+B of S)` — an index expression, then a selector after `of`.
 *
 * Classified as text-taking, these silently dropped `S`: `a:nth-child(2 of .foo)`
 * reported no classes with a clean parse. Same defect as `:right-of` — and a
 * reminder that "we recognize it" is not the same as "we read all of it".
 */
const NTH_OF_PSEUDOS = new Set(['nth-child', 'nth-last-child'])

/** Pseudo-classes whose argument is text, a number or a keyword — never a selector. */
const NON_SELECTOR_PSEUDOS = new Set([
  'has-text',
  'text',
  'text-is',
  'text-matches',
  'nth-of-type',
  'nth-last-of-type',
  'lang',
  'dir',
  'part',
])

function readPseudo(cursor: Cursor): PseudoSelector {
  cursor.take() // ':'
  const element = cursor.peek() === ':'
  if (element) {
    cursor.take()
  }
  const name = readIdentifier(cursor).toLowerCase()
  if (cursor.peek() !== '(') {
    return { name, element }
  }
  const argument = readArgument(cursor)
  if (SELECTOR_PSEUDOS.has(name)) {
    // Throws on an unreadable argument, so the whole selector lands in
    // `unparsed` — we cannot say a selector has no classes when part of it is
    // unreadable.
    return { name, argument, selectors: readSelectorList(argument), element }
  }
  if (SELECTOR_THEN_NUMBER_PSEUDOS.has(name)) {
    // `:nth-match(<selectors>, <n>)`, `:near(<selectors>, <distance>)` — the
    // trailing number is not a selector, and may be absent.
    const cut = argument.lastIndexOf(',')
    const head =
      cut > 0 && /^\s*[\d.]+\s*$/.test(argument.slice(cut + 1)) ? argument.slice(0, cut) : argument
    return { name, argument, selectors: readSelectorList(head), element }
  }
  if (NTH_OF_PSEUDOS.has(name)) {
    // `An+B` alone, or `An+B of <selector list>`.
    const of = /\sof\s/i.exec(argument)
    if (!of) {
      return { name, argument, element }
    }
    return {
      name,
      argument,
      selectors: readSelectorList(argument.slice(of.index + of[0].length)),
      element,
    }
  }
  if (NON_SELECTOR_PSEUDOS.has(name)) {
    return { name, argument, element }
  }
  // An argument-bearing pseudo we do not recognize could hold a selector or
  // could hold text. Guessing "text" reports a clean parse over something we
  // did not read; abstaining is the only honest answer.
  throw new SelectorSyntaxError(`unrecognized functional pseudo-class ":${name}()"`)
}

function emptyCompound(): CompoundSelector {
  return { classes: [], attributes: [], pseudos: [] }
}

function isEmptyCompound(compound: CompoundSelector): boolean {
  return (
    compound.tag === undefined &&
    compound.id === undefined &&
    compound.classes.length === 0 &&
    compound.attributes.length === 0 &&
    compound.pseudos.length === 0
  )
}

/**
 * Parses one selector from a list, stopping at a top-level `,` or `>>`.
 * Returns `null` when the next thing is a separator rather than a selector.
 */
function readComplex(cursor: Cursor): ComplexSelector {
  const compounds: CompoundSelector[] = []
  const combinators: Combinator[] = []
  let current = emptyCompound()
  let pendingCombinator: Combinator | null = null

  const flush = (): void => {
    if (isEmptyCompound(current)) {
      throw new SelectorSyntaxError('empty compound selector')
    }
    if (pendingCombinator !== null) {
      combinators.push(pendingCombinator)
      pendingCombinator = null
    }
    compounds.push(current)
    current = emptyCompound()
  }

  while (!cursor.done) {
    const char = cursor.peek()

    if (/\s/.test(char)) {
      const before = cursor.index
      cursor.skipSpaces()
      // A separator or an explicit combinator ends the run; otherwise the
      // whitespace itself is a descendant combinator.
      if (cursor.done || cursor.peek() === ',' || isChainOperator(cursor)) {
        cursor.index = before
        break
      }
      if ('>+~'.includes(cursor.peek())) {
        continue
      }
      if (!isEmptyCompound(current)) {
        flush()
        pendingCombinator = 'descendant'
      }
      continue
    }

    if (char === ',') {
      break
    }
    if (isChainOperator(cursor)) {
      break
    }

    if ('>+~'.includes(char)) {
      cursor.take()
      cursor.skipSpaces()
      if (!isEmptyCompound(current)) {
        flush()
      } else if (compounds.length === 0) {
        // `> .child` / `:has(> .child)` — a relative selector with an implicit
        // `:scope`. Playwright accepts these, and cal.com's page objects use
        // one; refusing to parse it was the tokenizer's only over-abstention.
        current.pseudos.push({ name: 'scope', element: false })
        flush()
      }
      if (pendingCombinator !== null) {
        // `a > > b`, `.a > + .b` — Playwright rejects these outright, so a
        // finding on one would be a finding on a selector that cannot run.
        throw new SelectorSyntaxError('two consecutive combinators')
      }
      pendingCombinator = char === '>' ? 'child' : char === '+' ? 'adjacent' : 'sibling'
      continue
    }

    if (char === '.') {
      cursor.take()
      current.classes.push(readIdentifier(cursor))
      continue
    }
    if (char === '#') {
      cursor.take()
      current.id = readIdentifier(cursor)
      continue
    }
    if (char === '[') {
      current.attributes.push(readAttribute(cursor))
      continue
    }
    if (char === ':') {
      current.pseudos.push(readPseudo(cursor))
      continue
    }
    if (char === '*') {
      cursor.take()
      current.tag = '*'
      continue
    }
    if (IDENTIFIER_START.test(char)) {
      if (current.tag !== undefined || current.classes.length > 0 || current.id !== undefined) {
        throw new SelectorSyntaxError('unexpected identifier in compound')
      }
      current.tag = readIdentifier(cursor).toLowerCase()
      continue
    }
    throw new SelectorSyntaxError(`unexpected character "${char}"`)
  }

  flush()
  return { compounds, combinators }
}

/** `>>` is Playwright's engine-chaining operator, not a CSS combinator. */
function isChainOperator(cursor: Cursor): boolean {
  return cursor.peek() === '>' && cursor.peek(1) === '>'
}

/** Parses a CSS selector list. Throws {@link SelectorSyntaxError} on anything unclear. */
function readSelectorList(text: string): ComplexSelector[] {
  const cursor = new Cursor(text)
  const selectors: ComplexSelector[] = []
  cursor.skipSpaces()
  if (cursor.done) {
    throw new SelectorSyntaxError('empty selector')
  }
  while (!cursor.done) {
    selectors.push(readComplex(cursor))
    cursor.skipSpaces()
    if (cursor.done) {
      break
    }
    if (cursor.peek() !== ',') {
      throw new SelectorSyntaxError('expected "," between selectors')
    }
    cursor.take()
    cursor.skipSpaces()
    if (cursor.done) {
      throw new SelectorSyntaxError('trailing "," in selector list')
    }
  }
  return selectors
}

/** Splits on top-level `>>`, respecting strings, brackets and parentheses. */
function splitChain(selector: string): {
  parts: string[]
  failed: boolean
  reason?: string
} {
  const parts: string[] = []
  const cursor = new Cursor(selector)
  let start = 0
  let brackets = 0
  let parens = 0
  let failed = false
  let reason: string | undefined
  while (!cursor.done) {
    const char = cursor.peek()
    // A quote delimits a string only where one can start: at the head of the
    // part, or inside brackets/parens. Treating every quote as a delimiter made
    // the apostrophe in `text=It's here >> .btn` open a string that never
    // closed, swallowing the rest of the selector into one part — and reporting
    // nothing, which is precisely the silent-wrong-answer this module forbids.
    // A quote opens a string at the head of a part, or immediately after that
    // part's engine prefix — `text="a >> b"` is documented Playwright syntax.
    const before = selector.slice(start, cursor.index)
    const atPartHead = before.trim() === '' || ENGINE_PREFIX_ONLY.test(before)
    if ((char === '"' || char === "'") && (atPartHead || brackets > 0 || parens > 0)) {
      try {
        readString(cursor)
      } catch {
        failed = true
        reason = 'unterminated string'
        break
      }
      continue
    }
    if (char === '[') brackets += 1
    else if (char === ']') brackets -= 1
    else if (char === '(') parens += 1
    else if (char === ')') parens -= 1
    else if (char === '>' && cursor.peek(1) === '>' && brackets <= 0 && parens <= 0) {
      parts.push(selector.slice(start, cursor.index))
      cursor.take()
      cursor.take()
      start = cursor.index
      continue
    }
    cursor.take()
  }
  parts.push(selector.slice(start))
  const trimmed = parts.map((part) => part.trim())
  // An empty part means a stray or doubled `>>` (`>> .a`, `a >> >> b`), which
  // Playwright rejects outright. Dropping it silently would report a finding on
  // a selector that cannot run.
  const empty = trimmed.some((part) => part === '')
  return {
    parts: trimmed.filter((part) => part !== ''),
    failed: failed || empty,
    reason: reason ?? (empty ? 'empty part in a ">>" chain' : undefined),
  }
}

/** Classifies an unprefixed part the way Playwright does. */
function defaultEngine(body: string): SelectorPart['engine'] {
  const trimmed = body.trimStart()
  if (trimmed.startsWith('//') || trimmed.startsWith('(//') || trimmed.startsWith('..')) {
    return 'xpath'
  }
  return 'css'
}

/**
 * Parses a Playwright selector into engine-tagged parts, with the CSS ones
 * tokenized.
 *
 * Never throws: anything unclear lands in `unparsed`, and the corresponding
 * part carries `css: undefined`.
 */
export function tokenizeSelector(selector: string): ParsedSelector {
  const unparsed: string[] = []
  const parts: SelectorPart[] = []

  const { parts: chain, failed: chainFailed, reason: chainFailure } = splitChain(selector)
  if (chainFailed) {
    // The real cause. Reporting "unterminated string" for a stray `>>` was
    // itself a false statement, in the module whose point is not making them.
    unparsed.push(chainFailure ?? 'could not split the selector')
  }
  if (chain.length === 0) {
    // An empty (or whitespace-only) selector parses to nothing, which a rule
    // must not read as "a selector with no classes in it".
    return { parts: [], unparsed: ['empty selector'] }
  }

  for (const raw of chain) {
    const match = ENGINE_PREFIX.exec(raw)
    // An engine prefix must be a known name: `div=1` is not an engine, and
    // neither is an attribute-ish fragment. Unknown names are still recorded so
    // a rule sees "some engine", not "CSS".
    const explicit = match ? match[1] : undefined
    const known = explicit !== undefined ? ENGINE_ALIASES[explicit] : undefined
    const engine: SelectorPart['engine'] =
      known ?? (explicit !== undefined && isEngineLike(explicit) ? 'other' : defaultEngine(raw))
    const body =
      explicit !== undefined && (known !== undefined || isEngineLike(explicit))
        ? raw.slice(match?.[0].length ?? 0).trim()
        : raw

    const part: SelectorPart = { engine, body }
    if (explicit !== undefined && (known !== undefined || isEngineLike(explicit))) {
      part.engineName = explicit
    }
    if (engine === 'css') {
      try {
        part.css = readSelectorList(body)
      } catch (error) {
        unparsed.push(error instanceof Error ? error.message : String(error))
      }
    }
    parts.push(part)
  }

  return { parts, unparsed }
}

/**
 * Whether `name=` at the start of a selector is an engine prefix.
 *
 * Playwright treats any `name=value` head as an engine and errors on an unknown
 * one, so anything shaped like one is not CSS — which is what a rule needs to
 * know. Kept narrow (no `.`/`#`/`[`) so a genuine CSS selector containing `=`
 * inside an attribute is never mistaken for a prefix.
 */
function isEngineLike(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name)
}
