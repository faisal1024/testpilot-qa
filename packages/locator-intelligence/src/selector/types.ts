/**
 * A parsed Playwright selector.
 *
 * Playwright's selector syntax is CSS plus its own additions: engine prefixes
 * (`text=`, `xpath=`, `css=`), the `>>` chaining operator, and extra
 * pseudo-classes (`:has-text()`, `:visible`, `:nth-match()`). The tokenizer
 * models all of it, because a rule that reasons about "the CSS part" has to
 * know where that part ends.
 */

/** `[name]`, `[name="value"]`, `[name^='v' i]`. */
export interface AttributeSelector {
  name: string
  /** `=`, `^=`, `$=`, `*=`, `~=`, `|=`, or undefined for a bare `[name]`. */
  operator?: string
  /** The value with quotes removed and escapes resolved. */
  value?: string
  /** True for the `i`/`s` flag after the value. */
  caseInsensitive?: boolean
}

/** `:hover`, `:nth-child(2)`, `:has-text("Save")`. */
export interface PseudoSelector {
  name: string
  /** Raw argument text, exactly as written. */
  argument?: string
  /**
   * The parsed argument, for pseudo-classes whose argument *is* a selector
   * list (`:has`, `:not`, `:is`, `:where`, and the head of `:nth-match`).
   *
   * Present because a selector nested in one is still a selector:
   * `button:has(i.icon-dots-vertical)` really does use a class, and treating
   * the argument as opaque text turned a true finding into a false negative.
   */
  selectors?: ComplexSelector[]
  /** True for `::before` and friends. */
  element: boolean
}

/** One compound: `div#main.a.b[hidden]:hover` — no combinators inside. */
export interface CompoundSelector {
  /** `div`, `*`, or undefined when the compound leads with `.`/`#`/`[`/`:`. */
  tag?: string
  /** The `#id`, escapes resolved. */
  id?: string
  /** `.class` names, escapes resolved — so Tailwind's `.mt-1\.5` is one class. */
  classes: string[]
  attributes: AttributeSelector[]
  pseudos: PseudoSelector[]
}

export type Combinator = 'descendant' | 'child' | 'adjacent' | 'sibling'

/** One selector in a list: compounds joined by combinators. */
export interface ComplexSelector {
  compounds: CompoundSelector[]
  /** One shorter than `compounds`. */
  combinators: Combinator[]
}

/**
 * One `>>`-separated part of a Playwright selector, with the engine it uses.
 *
 * `text=Save`, `css=div.a`, or an unprefixed part (CSS by default, unless it
 * looks like XPath).
 */
export interface SelectorPart {
  engine: 'css' | 'text' | 'xpath' | 'id' | 'role' | 'test-id' | 'react' | 'vue' | 'other'
  /** The engine name as written, when one was explicit. */
  engineName?: string
  /** Everything after the engine prefix. */
  body: string
  /**
   * The parsed selector list, for `css` parts only — `undefined` for every
   * other engine, and for a CSS part the tokenizer could not parse.
   */
  css?: ComplexSelector[]
}

export interface ParsedSelector {
  parts: SelectorPart[]
  /**
   * True when the input was the static prefix of a template literal, so the
   * real selector continues beyond what we can see. A rule must not conclude
   * anything from the *absence* of something in a truncated selector.
   */
  truncated: boolean
  /**
   * Set when some part could not be parsed — an unbalanced bracket, an
   * unterminated string. The part is still present with `css: undefined`, and
   * a rule that needs the parse must abstain rather than guess.
   */
  unparsed: string[]
}
