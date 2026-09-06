import type {
  AttributeSelector,
  ComplexSelector,
  CompoundSelector,
  ParsedSelector,
} from './types.js'

/**
 * Helpers that ask one question of a parsed selector.
 *
 * Every one of them returns `null` for "I could not read this", never a
 * default. A rule that treats an unreadable selector as an empty one produces
 * exactly the confident-wrong-answer this package exists to avoid.
 */

/** Every CSS selector across all `>>` parts, or `null` if any CSS part failed to parse. */
export function cssSelectors(parsed: ParsedSelector): ComplexSelector[] | null {
  if (parsed.unparsed.length > 0) {
    return null
  }
  const out: ComplexSelector[] = []
  for (const part of parsed.parts) {
    if (part.engine === 'css') {
      if (!part.css) {
        return null
      }
      out.push(...part.css)
    }
  }
  return out
}

/** Class names used anywhere in the selector, deduped, or `null` when unreadable. */
export function classTokens(parsed: ParsedSelector): string[] | null {
  const selectors = cssSelectors(parsed)
  if (selectors === null) {
    return null
  }
  const classes = new Set<string>()
  const visit = (list: ComplexSelector[]): void => {
    for (const selector of list) {
      for (const compound of selector.compounds) {
        for (const name of compound.classes) {
          classes.add(name)
        }
        // A class nested in `:has(i.icon)` is still a class the test depends on.
        for (const pseudo of compound.pseudos) {
          if (pseudo.selectors) {
            visit(pseudo.selectors)
          }
        }
      }
    }
  }
  visit(selectors)
  return [...classes]
}

/**
 * Whether any compound uses one of the given pseudo-classes, nested ones
 * included. `null` when the selector could not be read.
 */
export function hasPseudo(parsed: ParsedSelector, names: ReadonlySet<string>): boolean | null {
  const selectors = cssSelectors(parsed)
  if (selectors === null) {
    return null
  }
  let found = false
  const visit = (list: ComplexSelector[]): void => {
    for (const selector of list) {
      for (const compound of selector.compounds) {
        for (const pseudo of compound.pseudos) {
          if (names.has(pseudo.name)) {
            found = true
          }
          if (pseudo.selectors) {
            visit(pseudo.selectors)
          }
        }
      }
    }
  }
  visit(selectors)
  return found
}

/**
 * Every attribute selector across all CSS parts, nested ones included, in
 * source order. `null` when the selector could not be read.
 */
export function attributeTokens(parsed: ParsedSelector): AttributeSelector[] | null {
  const selectors = cssSelectors(parsed)
  if (selectors === null) {
    return null
  }
  const found: AttributeSelector[] = []
  const visit = (list: ComplexSelector[]): void => {
    for (const selector of list) {
      for (const compound of selector.compounds) {
        found.push(...compound.attributes)
        for (const pseudo of compound.pseudos) {
          if (pseudo.selectors) {
            visit(pseudo.selectors)
          }
        }
      }
    }
  }
  visit(selectors)
  return found
}

/**
 * The last compound of the last CSS selector — the element a `locator()` call
 * actually targets. `null` when the selector could not be read, or when the
 * final `>>` part is not CSS (so the target is some other engine's business).
 *
 * `prefer-get-by-test-id` needs it: `locator('[data-testid=list] > li a')`
 * targets the anchor, not the list, so "use getByTestId" is advice about the
 * wrong element unless the test id is on the target itself.
 */
export function targetCompound(parsed: ParsedSelector): CompoundSelector | null {
  if (parsed.unparsed.length > 0) {
    return null
  }
  const last = parsed.parts.at(-1)
  if (!last || last.engine !== 'css' || !last.css) {
    return null
  }
  // A selector *list* (`a, b`) has more than one target. Nothing here is safe to
  // call "the" target, so callers get an abstention rather than the first arm.
  if (last.css.length !== 1) {
    return null
  }
  return last.css[0]?.compounds.at(-1) ?? null
}
