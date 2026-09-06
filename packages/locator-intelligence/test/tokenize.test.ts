import { describe, expect, it } from 'vitest'
import { tokenizeSelector } from '../src/selector/index.js'

const css = (selector: string) => tokenizeSelector(selector).parts[0]?.css
const one = (selector: string) => css(selector)?.[0]
const compound = (selector: string) => one(selector)?.compounds[0]

describe('compounds', () => {
  it('reads a tag', () => {
    expect(compound('div')).toMatchObject({ tag: 'div', classes: [], attributes: [] })
  })

  it('reads an id, classes, attributes and pseudos together', () => {
    expect(compound('div#main.a.b[hidden]:hover')).toMatchObject({
      tag: 'div',
      id: 'main',
      classes: ['a', 'b'],
      attributes: [{ name: 'hidden' }],
      pseudos: [{ name: 'hover', element: false }],
    })
  })

  it('reads the universal selector', () => {
    expect(compound('*')).toMatchObject({ tag: '*' })
  })

  it('distinguishes a pseudo-element', () => {
    expect(compound('p::before')?.pseudos).toEqual([{ name: 'before', element: true }])
  })
})

describe('the three inputs every regex got wrong', () => {
  it('does not read a quoted attribute value as a class', () => {
    // `/\.[a-zA-Z_-]/` matched the `.pdf` inside the value.
    const parsed = compound('[href=".pdf"]')
    expect(parsed?.classes).toEqual([])
    expect(parsed?.attributes).toEqual([{ name: 'href', operator: '=', value: '.pdf' }])
  })

  it('keeps an escaped dot inside one class name', () => {
    // Tailwind's `mt-1.5` is written `.mt-1\.5` and is a single class.
    expect(compound('.mt-1\\.5')?.classes).toEqual(['mt-1.5'])
  })

  it('treats a selector list as separate selectors, not a descendant chain', () => {
    const list = css('a, b, c')
    expect(list).toHaveLength(3)
    expect(list?.every((selector) => selector.combinators.length === 0)).toBe(true)
  })
})

describe('attributes', () => {
  it.each([
    ['[a=b]', { name: 'a', operator: '=', value: 'b' }],
    ['[a^="b"]', { name: 'a', operator: '^=', value: 'b' }],
    ["[a$='b']", { name: 'a', operator: '$=', value: 'b' }],
    ['[a*=b]', { name: 'a', operator: '*=', value: 'b' }],
    ['[a~=b]', { name: 'a', operator: '~=', value: 'b' }],
    ['[a|=b]', { name: 'a', operator: '|=', value: 'b' }],
    ['[data-test-id="x"]', { name: 'data-test-id', operator: '=', value: 'x' }],
  ])('reads %s', (selector, expected) => {
    expect(compound(selector)?.attributes[0]).toMatchObject(expected)
  })

  it('reads a bare attribute with no value', () => {
    expect(compound('[disabled]')?.attributes[0]).toEqual({ name: 'disabled' })
  })

  it('reads the case-insensitive flag', () => {
    expect(compound('[a="b" i]')?.attributes[0]).toMatchObject({ caseInsensitive: true })
  })

  it('keeps a value containing selector punctuation opaque', () => {
    expect(compound('[title="a > b, c #d .e"]')?.attributes[0]?.value).toBe('a > b, c #d .e')
  })

  it('keeps a value containing an escaped quote', () => {
    expect(compound('[title="say \\"hi\\""]')?.attributes[0]?.value).toBe('say "hi"')
  })

  it('does not split a chain operator inside an attribute value', () => {
    const parsed = tokenizeSelector('[title="a >> b"]')
    expect(parsed.parts).toHaveLength(1)
    expect(parsed.parts[0]?.css?.[0]?.compounds[0]?.attributes[0]?.value).toBe('a >> b')
  })
})

describe('combinators', () => {
  it.each([
    ['a b', ['descendant']],
    ['a > b', ['child']],
    ['a>b', ['child']],
    ['a + b', ['adjacent']],
    ['a ~ b', ['sibling']],
    ['a b > c + d', ['descendant', 'child', 'adjacent']],
  ])('reads %s', (selector, expected) => {
    expect(one(selector)?.combinators).toEqual(expected)
  })

  it('does not count whitespace inside brackets or parentheses', () => {
    expect(one('[title="a b c"]')?.combinators).toEqual([])
    expect(one(':has(a b c)')?.combinators).toEqual([])
  })
})

describe('pseudo-classes', () => {
  it('captures a nested selector argument, and parses it', () => {
    const pseudo = compound(':has(div > span)')?.pseudos[0]
    expect(pseudo).toMatchObject({ name: 'has', argument: 'div > span', element: false })
    expect(pseudo?.selectors?.[0]?.combinators).toEqual(['child'])
  })

  it.each([':has', ':not', ':is', ':where'])('parses the argument of %s', (name) => {
    expect(compound(`${name}(.card)`)?.pseudos[0]?.selectors?.[0]?.compounds[0]?.classes).toEqual([
      'card',
    ])
  })

  it('parses the selector head of :nth-match but not its index', () => {
    const pseudo = compound(':nth-match(.item, 2)')?.pseudos[0]
    expect(pseudo?.selectors?.[0]?.compounds[0]?.classes).toEqual(['item'])
  })

  it('does not parse a text-taking pseudo as a selector', () => {
    // `:has-text("a.b")` contains no class; parsing it as CSS would invent one.
    const pseudo = compound(':has-text("a.b")')?.pseudos[0]
    expect(pseudo?.selectors).toBeUndefined()
    expect(pseudo?.argument).toBe('"a.b"')
  })

  it('fails the whole parse when a nested selector is unreadable', () => {
    // "has no classes" is not a safe conclusion when part of it is unreadable.
    expect(tokenizeSelector(':has([oops)').unparsed.length).toBeGreaterThan(0)
  })

  it("captures Playwright's own pseudo-classes", () => {
    expect(compound(':has-text("Save")')?.pseudos[0]).toMatchObject({ name: 'has-text' })
    expect(compound(':visible')?.pseudos[0]).toMatchObject({ name: 'visible' })
    expect(compound(':nth-match(a, 2)')?.pseudos[0]).toMatchObject({ name: 'nth-match' })
  })

  it('handles nested parentheses in an argument', () => {
    expect(compound(':has(:not(.a))')?.pseudos[0]?.argument).toBe(':not(.a)')
  })

  it('does not treat a comma inside an argument as a list separator', () => {
    expect(css(':nth-match(a, 2)')).toHaveLength(1)
  })
})

describe('Playwright engines', () => {
  it.each([
    ['text=Save', 'text'],
    ['css=div.a', 'css'],
    ['xpath=//button', 'xpath'],
    ['id=main', 'id'],
    ['data-testid=submit', 'test-id'],
    ['role=button', 'role'],
  ])('classifies %s as %s', (selector, engine) => {
    expect(tokenizeSelector(selector).parts[0]?.engine).toBe(engine)
  })

  it('infers xpath from a leading // or ..', () => {
    expect(tokenizeSelector('//button').parts[0]?.engine).toBe('xpath')
    expect(tokenizeSelector('..').parts[0]?.engine).toBe('xpath')
    expect(tokenizeSelector('(//a)[1]').parts[0]?.engine).toBe('xpath')
  })

  it('defaults to css', () => {
    expect(tokenizeSelector('div.a').parts[0]?.engine).toBe('css')
  })

  it('splits a >> chain and tags each part', () => {
    const parsed = tokenizeSelector('div.card >> text=Save')
    expect(parsed.parts.map((part) => part.engine)).toEqual(['css', 'text'])
    expect(parsed.parts[0]?.css?.[0]?.compounds[0]?.classes).toEqual(['card'])
    expect(parsed.parts[1]?.body).toBe('Save')
  })

  it('does not parse a non-css part as css', () => {
    expect(tokenizeSelector('text=Save').parts[0]?.css).toBeUndefined()
    expect(tokenizeSelector('//button').parts[0]?.css).toBeUndefined()
  })

  it('records an unknown engine as `other` rather than guessing css', () => {
    const part = tokenizeSelector('mystery=thing').parts[0]
    expect(part?.engine).toBe('other')
    expect(part?.css).toBeUndefined()
  })
})

describe('never guesses', () => {
  it.each([
    ['[unterminated', 'unterminated attribute'],
    ['[a="oops]', 'unterminated string'],
    [':has(a', 'unbalanced parentheses'],
    ['a,', 'trailing comma'],
    ['', 'empty'],
    ['.', 'lone dot'],
    ['#', 'lone hash'],
  ])('reports %j as unparsed instead of parsing it wrong', (selector) => {
    const parsed = tokenizeSelector(selector)
    expect(parsed.unparsed.length).toBeGreaterThan(0)
    expect(parsed.parts.every((part) => part.css === undefined)).toBe(true)
  })

  it.each([
    ['> button', 'child'],
    ['+ div', 'adjacent'],
    ['~ p', 'sibling'],
  ])('accepts the relative selector %j, which Playwright does', (selector, combinator) => {
    // CSS L4 relative selectors have an implicit `:scope` head. cal.com's page
    // objects use `:has(> ${sel})`; refusing them was an over-abstention.
    const parsed = tokenizeSelector(selector)
    expect(parsed.unparsed).toEqual([])
    expect(parsed.parts[0]?.css?.[0]?.combinators).toEqual([combinator])
  })

  it('accepts a relative selector inside :has()', () => {
    expect(tokenizeSelector('.card:has(> .icon)').unparsed).toEqual([])
  })

  it('never throws, whatever it is given', () => {
    for (const selector of ['[[[', '((((', '"""', '\\', 'a >> [', '::', ',,,']) {
      expect(() => tokenizeSelector(selector)).not.toThrow()
    }
  })

  it('reports an unterminated string rather than swallowing the remainder', () => {
    // `text=It's here >> .btn`: the apostrophe used to open a string that never
    // closed, folding the whole selector into one part with unparsed empty.
    const parsed = tokenizeSelector('"unclosed >> .btn')
    expect(parsed.unparsed.length).toBeGreaterThan(0)
  })
})

describe('real selectors from the corpus', () => {
  it.each([
    '[data-testid="conversation-header"]',
    '.channel-view .post__body',
    'button[type="submit"]',
    '#post_textbox',
    'div[role="dialog"] >> text=Confirm',
    '.SidebarChannel:has-text("Town Square")',
    'input[placeholder="Search"]',
  ])('parses %s', (selector) => {
    expect(tokenizeSelector(selector).unparsed).toEqual([])
  })
})

describe("Playwright's own functional pseudo-classes", () => {
  it.each([
    ['input:right-of(.label)', 'label'],
    ['button:left-of(.x)', 'x'],
    ['div:above(.hdr)', 'hdr'],
    ['div:below(.hdr)', 'hdr'],
    ['input:near(.lbl)', 'lbl'],
    ['input:near(.lbl, 50)', 'lbl'],
    ['div:light(.card)', 'card'],
  ])('reads the selector argument of %s', (selector, expected) => {
    // Read as opaque text these reported "no classes" with a clean parse —
    // a silent false negative, and the exact defect :has() had.
    expect(classesOf(selector)).toEqual([expected])
  })

  it.each([':has-text("a.b")', ':text("a.b")', ':text-is("a.b")', ':text-matches("a.b")'])(
    'does not read %s as a selector',
    (selector) => {
      expect(classesOf(`div${selector}`)).toEqual([])
      expect(tokenizeSelector(`div${selector}`).unparsed).toEqual([])
    },
  )

  it.each([':nth-child(2n+1)', ':nth-of-type(2)', ':lang(en)', ':dir(ltr)'])(
    'accepts the non-selector argument of %s',
    (selector) => {
      expect(tokenizeSelector(`div${selector}`).unparsed).toEqual([])
    },
  )

  it('abstains on an argument-bearing pseudo it does not recognize', () => {
    // It could hold a selector or text; guessing "text" reports a clean parse
    // over something we never read.
    expect(tokenizeSelector('div:mystery(.a)').unparsed.length).toBeGreaterThan(0)
  })
})

describe('CSS escapes', () => {
  it.each([
    ['.\\31 abc', '1abc'],
    ['.\\41 bc', 'Abc'],
    ['.\\3A hover', ':hover'],
    ['.\\2c x', ',x'],
    ['.mt-1\\.5', 'mt-1.5'],
  ])('decodes %s to the class %j', (selector, expected) => {
    // `\\31 ` is what CSS.escape() emits for a name starting with a digit, so
    // this is reachable. Copying the next character produced a class named "31"
    // and invented a descendant compound out of the rest.
    expect(classesOf(selector)).toEqual([expected])
  })

  it('does not invent a descendant step out of an escape terminator', () => {
    expect(tokenizeSelector('.\\41 bc').parts[0]?.css?.[0]?.combinators).toEqual([])
  })

  it('abstains on an invalid escape', () => {
    expect(tokenizeSelector('.\\0 a').unparsed.length).toBeGreaterThan(0)
  })
})

function classesOf(selector: string): string[] {
  const parsed = tokenizeSelector(selector)
  return (parsed.parts[0]?.css ?? []).flatMap((complex) =>
    complex.compounds.flatMap((compound) => [
      ...compound.classes,
      ...compound.pseudos.flatMap((pseudo) =>
        (pseudo.selectors ?? []).flatMap((nested) =>
          nested.compounds.flatMap((inner) => inner.classes),
        ),
      ),
    ]),
  )
}
