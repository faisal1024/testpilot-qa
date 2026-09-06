import type { AttributeSelector, ComplexSelector, ParsedSelector } from './types.js'

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
 * Attribute selectors written at the top level of the selector — **not** those
 * inside a pseudo-class argument.
 *
 * The distinction decides whether an attribute describes the element being
 * selected. In `div:not([data-testid="banner"])` the test id names an element
 * the selector deliberately *excludes*; in `li:has([data-testid="badge"])` it
 * names a descendant. A rule that suggested "scope by that test id" for either
 * would be advice about the wrong element, in the second case inverted.
 */
export function topLevelAttributeTokens(parsed: ParsedSelector): AttributeSelector[] | null {
  const selectors = cssSelectors(parsed)
  if (selectors === null) {
    return null
  }
  const found: AttributeSelector[] = []
  for (const selector of selectors) {
    for (const compound of selector.compounds) {
      found.push(...compound.attributes)
    }
  }
  return found
}
