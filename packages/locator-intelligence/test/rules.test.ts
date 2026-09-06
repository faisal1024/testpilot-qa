import { describe, expect, it } from 'vitest'
import { extractLocators } from '../src/extractor.js'
import type { LocatorContext } from '../src/locator-context.js'
import { parseSource } from '../src/parser.js'
import { avoidParentTraversal } from '../src/rules/avoid-parent-traversal.js'
import { avoidPositionalAccess } from '../src/rules/avoid-positional-access.js'
import { noCssClassSelector } from '../src/rules/no-css-class-selector.js'
import { noDeepCssChain } from '../src/rules/no-deep-css-chain.js'
import { noHardWait } from '../src/rules/no-hard-wait.js'
import { noNthChild } from '../src/rules/no-nth-child.js'
import { noXpath } from '../src/rules/no-xpath.js'
import { preferGetByTestId } from '../src/rules/prefer-get-by-test-id.js'
import { preferSemanticLocator } from '../src/rules/prefer-semantic-locator.js'
import { maxChainDepth } from '../src/selector/depth.js'
import { tokenizeSelector } from '../src/selector/tokenize.js'

function ctx(overrides: Partial<LocatorContext>): LocatorContext {
  return {
    apiCall: 'locator',
    isDynamic: false,
    raw: '',
    line: 1,
    column: 1,
    ...overrides,
  }
}

function css(selector: string): LocatorContext {
  // Tokenized here exactly as the extractor does, so a rule test cannot pass
  // against a context shape the engine never produces.
  return ctx({ selector, selectorEngine: 'css', parsed: tokenizeSelector(selector) })
}

describe('no-xpath', () => {
  it('flags xpath selectors and ignores css/dynamic', () => {
    expect(noXpath.evaluate(ctx({ selector: '//div', selectorEngine: 'xpath' }))).not.toBeNull()
    expect(noXpath.evaluate(css('.btn'))).toBeNull()
    expect(noXpath.evaluate(ctx({ isDynamic: true, selectorEngine: 'xpath' }))).toBeNull()
  })
})

describe('no-css-class-selector', () => {
  it('flags class selectors, ignores id/attribute and non-locator', () => {
    expect(noCssClassSelector.evaluate(css('.btn-primary'))).not.toBeNull()
    expect(noCssClassSelector.evaluate(css('button.primary'))).not.toBeNull()
    expect(noCssClassSelector.evaluate(css('#submit'))).toBeNull()
    expect(noCssClassSelector.evaluate(ctx({ apiCall: 'getByTestId', selector: '.x' }))).toBeNull()
  })
})

describe('no-nth-child', () => {
  it('flags :nth-child() css selectors', () => {
    expect(noNthChild.evaluate(css('ul li:nth-child(2)'))).not.toBeNull()
  })
  it('no longer flags .nth() — that is avoid-positional-access now', () => {
    expect(noNthChild.evaluate(ctx({ apiCall: 'nth' }))).toBeNull()
  })

  it('does not fire on the pseudo name inside an attribute value', () => {
    expect(noNthChild.evaluate(css('[title=":nth-child(2)"]'))).toBeNull()
  })

  it('finds :nth-child nested inside :has()', () => {
    expect(noNthChild.evaluate(css('ul:has(li:nth-child(2))'))).not.toBeNull()
  })
  it('ignores selectors without positional selection', () => {
    expect(noNthChild.evaluate(css('button'))).toBeNull()
    expect(noNthChild.evaluate(ctx({ apiCall: 'getByRole', selector: 'button' }))).toBeNull()
  })
  it('declares error severity', () => {
    expect(noNthChild.defaultSeverity).toBe('error')
  })
})

describe('no-deep-css-chain', () => {
  it('computes a conservative combinator depth', () => {
    expect(maxChainDepth(tokenizeSelector('.a'))).toBe(0)
    expect(maxChainDepth(tokenizeSelector('div > button'))).toBe(1)
    expect(maxChainDepth(tokenizeSelector('#c > div > button'))).toBe(2)
    expect(maxChainDepth(tokenizeSelector('header nav ul li a'))).toBe(4)
    // Spaces inside brackets/parens are not miscounted.
    expect(maxChainDepth(tokenizeSelector('a[title="x y z"]'))).toBe(0)
    expect(maxChainDepth(tokenizeSelector('li:nth-child(2)'))).toBe(0)
  })
  it('flags deep chains only at/above the threshold', () => {
    expect(noDeepCssChain.evaluate(css('div > button'))).toBeNull()
    expect(noDeepCssChain.evaluate(css('#c > div > button'))).toBeNull()
    expect(noDeepCssChain.evaluate(css('header nav ul li a'))).not.toBeNull()
  })
  it('is warn severity and ignores xpath', () => {
    expect(noDeepCssChain.defaultSeverity).toBe('warn')
    expect(
      noDeepCssChain.evaluate(ctx({ selector: '//a/b/c/d', selectorEngine: 'xpath' })),
    ).toBeNull()
  })
})

describe('prefer-get-by-test-id', () => {
  it('flags a test id addressed as a CSS attribute, and names the replacement', () => {
    const violation = preferGetByTestId.evaluate(css('[data-testid="save"]'))
    expect(violation?.suggestion).toContain('getByTestId("save")')
  })

  it('does not offer a chained locator() for conditions on the same element', () => {
    // `getByTestId('row').locator('button')` queries the SUBTREE of the test id.
    // `button[data-testid="row"]` is one element. The old message said "keep the
    // rest of the selector on the chained locator()", which changes what the
    // test acts on — 48 of the 503 corpus findings took that branch.
    const violation = preferGetByTestId.evaluate(css('button[data-testid="row"]'))
    expect(violation?.message).toContain('on the same element')
    expect(violation?.suggestion).toContain('Use getByTestId("row")')
    expect(violation?.suggestion).toContain('cannot move to a chained locator()')
  })

  it('offers a scope only when the test id is genuinely an ancestor', () => {
    const violation = preferGetByTestId.evaluate(css('[data-testid="list"] > li a'))
    expect(violation?.message).toContain('ancestor')
    expect(violation?.suggestion).toContain('Scope with getByTestId("list")')
  })

  it('names the attribute without inventing an argument for a non-equality match', () => {
    const violation = preferGetByTestId.evaluate(css('[data-testid^="row-"]'))
    expect(violation).not.toBeNull()
    expect(violation?.suggestion).not.toContain('getByTestId("row-')
  })

  it('reads the configured attribute list, and only it', () => {
    expect(preferGetByTestId.evaluate(css('[data-qa="save"]'))).toBeNull()
    expect(
      preferGetByTestId.evaluate(css('[data-qa="save"]'), { testIdAttributes: ['data-qa'] }),
    ).not.toBeNull()
    // An explicit list replaces the defaults rather than extending them.
    expect(
      preferGetByTestId.evaluate(css('[data-testid="save"]'), { testIdAttributes: ['data-qa'] }),
    ).toBeNull()
  })

  it('says nothing about a test id inside :not() or :has()', () => {
    // `div:not([data-testid=banner])` selects elements that are NOT that test
    // id: "scope with getByTestId('banner')" is the inverse of the selector.
    // `li:has([data-test=badge])` targets the li *containing* the badge, so a
    // scope-and-chain rewrite points the other way down the tree. Both used to
    // print a confident suggestion.
    expect(preferGetByTestId.evaluate(css('div:not([data-testid="banner"])'))).toBeNull()
    expect(preferGetByTestId.evaluate(css('li:has([data-test="badge"])'))).toBeNull()
  })

  it('says nothing when the selector is a list, because there is no one target', () => {
    // Matches a OR b; naming the first arm silently drops the second.
    expect(preferGetByTestId.evaluate(css('[data-testid="a"], [data-testid="b"]'))).toBeNull()
  })

  it('does not offer getByTestId() for a case-insensitive match', () => {
    // `getByTestId('save')` is exact and case-sensitive; `[data-testid="save" i]`
    // also matches `SAVE`. The old code printed it as a direct replacement.
    const violation = preferGetByTestId.evaluate(css('[data-testid="save" i]'))
    expect(violation?.suggestion).not.toContain('getByTestId("save")')
    expect(violation?.suggestion).toContain('RegExp')
  })

  it('says nothing about a bare presence check', () => {
    // `getByTestId()` has no "has any test id" form.
    expect(preferGetByTestId.evaluate(css('[data-testid]'))).toBeNull()
  })

  it('treats *[data-testid=x] as the same selector as [data-testid=x]', () => {
    expect(preferGetByTestId.evaluate(css('*[data-testid="save"]'))?.suggestion).toBe(
      'Use getByTestId("save") instead.',
    )
  })

  it("owns Playwright's own data-testid= selector engine", () => {
    // Routed to prefer-semantic-locator before, which said the opposite:
    // "no semantic handle" about a selector with an exact getByTestId() form.
    const selector = 'data-testid=save'
    const context = ctx({ selector, selectorEngine: 'css', parsed: tokenizeSelector(selector) })
    expect(preferGetByTestId.evaluate(context)?.suggestion).toContain('getByTestId("save")')
    expect(preferSemanticLocator.evaluate(context)).toBeNull()
  })

  it('abstains on an unreadable selector rather than guessing', () => {
    expect(preferGetByTestId.evaluate(css('[data-testid="a'))).toBeNull()
  })

  it('ignores getByTestId itself, dynamic selectors and xpath', () => {
    expect(preferGetByTestId.evaluate(ctx({ apiCall: 'getByTestId', selector: 'save' }))).toBeNull()
    expect(preferGetByTestId.evaluate(ctx({ isDynamic: true }))).toBeNull()
    expect(preferGetByTestId.evaluate(xpath('//*[@data-testid]'))).toBeNull()
  })

  it('is warn severity — it is the case with a mechanical fix', () => {
    expect(preferGetByTestId.defaultSeverity).toBe('warn')
  })
})

describe('prefer-semantic-locator', () => {
  it('flags a structural selector and a text= string', () => {
    expect(preferSemanticLocator.evaluate(css('#submit'))).not.toBeNull()
    expect(preferSemanticLocator.evaluate(css('div.row > span'))).not.toBeNull()
    expect(
      preferSemanticLocator.evaluate(
        ctx({ selector: 'text=Hi', selectorEngine: 'text', parsed: tokenizeSelector('text=Hi') }),
      ),
    ).not.toBeNull()
  })

  it('does not fire on a role or aria attribute', () => {
    expect(preferSemanticLocator.evaluate(css('[role="tab"]'))).toBeNull()
    expect(preferSemanticLocator.evaluate(css('[aria-label="Close"]'))).toBeNull()
    expect(preferSemanticLocator.evaluate(css('button[aria-expanded]'))).toBeNull()
    // Nested inside :not() still counts — the test depends on it either way.
    expect(preferSemanticLocator.evaluate(css('div:not([role="presentation"])'))).toBeNull()
  })

  it('does not fire on the role= engine', () => {
    const selector = 'role=button[name="Save"]'
    expect(
      preferSemanticLocator.evaluate(
        ctx({ selector, selectorEngine: 'css', parsed: tokenizeSelector(selector) }),
      ),
    ).toBeNull()
  })

  it('does not fire on a composed locator, in either spelling', () => {
    expect(
      preferSemanticLocator.evaluate(ctx({ ...css('.row'), options: { hasText: true } })),
    ).toBeNull()
    expect(preferSemanticLocator.evaluate(css('li:has-text("Save")'))).toBeNull()
    expect(preferSemanticLocator.evaluate(css('li:has(button)'))).toBeNull()
  })

  it('does not fire when narrowing a user-facing parent', () => {
    expect(preferSemanticLocator.evaluate(ctx({ ...css('td'), parentApi: 'getByRole' }))).toBeNull()
    expect(
      preferSemanticLocator.evaluate(ctx({ ...css('td'), parentApi: 'getByTestId' })),
    ).toBeNull()
    // A `locator()` parent is not user-facing, so the child is still judged.
    expect(
      preferSemanticLocator.evaluate(ctx({ ...css('td'), parentApi: 'locator' })),
    ).not.toBeNull()
  })

  it('sees through .filter()/.first()/.nth() to the parent that carries the semantics', () => {
    // Built through the real extractor, not by hand: a hand-built `parentApi`
    // pins the rule and leaves `receiverApi` free to break underneath it.
    for (const chain of [
      "page.getByRole('row').filter({ hasText: 'x' }).locator('td')",
      "page.getByRole('row').first().locator('td')",
      "page.getByRole('row').nth(1).locator('td')",
    ]) {
      const child = extractLocators(chain, parseSource(chain, 'a.ts')).find(
        (context) => context.selector === 'td',
      )
      expect(child, chain).toBeDefined()
      expect(preferSemanticLocator.evaluate(child as LocatorContext), chain).toBeNull()
    }
  })

  it('treats .filter({ hasText }) as the composition it is', () => {
    // The same Playwright feature as `locator('.row', { hasText })`, and the
    // more idiomatic spelling. Firing on one and not the other would be an
    // answer about syntax.
    const source = "page.locator('.row').filter({ hasText: 'Save' })"
    const row = extractLocators(source, parseSource(source, 'a.ts')).find(
      (context) => context.selector === '.row',
    )
    expect(row).toBeDefined()
    expect(preferSemanticLocator.evaluate(row as LocatorContext)).toBeNull()
  })

  it('abstains on :text() for the same reason as :has-text()', () => {
    expect(preferSemanticLocator.evaluate(css('li:text("Save")'))).toBeNull()
    expect(preferSemanticLocator.evaluate(css('li:text-is("Save")'))).toBeNull()
  })

  it('reads the same configured test-id list as prefer-get-by-test-id', () => {
    // Hand off on a broader notion than the other rule accepts and a call site
    // falls between them, reported by neither.
    const options = { testIdAttributes: ['data-qa'] }
    expect(preferSemanticLocator.evaluate(css('[data-qa="save"]'), options)).toBeNull()
    expect(preferGetByTestId.evaluate(css('[data-qa="save"]'), options)).not.toBeNull()
    // ...and the default attribute is no longer silently owned by nobody.
    expect(preferSemanticLocator.evaluate(css('[data-testid="save"]'), options)).not.toBeNull()
    expect(preferGetByTestId.evaluate(css('[data-testid="save"]'), options)).toBeNull()
  })

  it('leaves test ids to prefer-get-by-test-id, so one call site gets one line', () => {
    expect(preferSemanticLocator.evaluate(css('[data-testid="save"]'))).toBeNull()
    expect(preferGetByTestId.evaluate(css('[data-testid="save"]'))).not.toBeNull()
  })

  it('abstains on an unreadable selector rather than guessing', () => {
    expect(preferSemanticLocator.evaluate(css('div[unclosed="a'))).toBeNull()
  })

  it('ignores xpath, dynamic, and non-locator APIs', () => {
    expect(preferSemanticLocator.evaluate(xpath('//a'))).toBeNull()
    expect(preferSemanticLocator.evaluate(ctx({ isDynamic: true }))).toBeNull()
    expect(
      preferSemanticLocator.evaluate(ctx({ apiCall: 'getByRole', selector: 'button' })),
    ).toBeNull()
  })

  it('is info severity — Tier 1 cannot name the replacement', () => {
    expect(preferSemanticLocator.defaultSeverity).toBe('info')
  })
})

describe('no-hard-wait', () => {
  it('flags waitForTimeout and nothing else', () => {
    expect(noHardWait.evaluate(ctx({ apiCall: 'waitForTimeout' }))).not.toBeNull()
    expect(noHardWait.evaluate(css('.btn'))).toBeNull()
  })
  it('is a flakiness rule with error severity', () => {
    expect(noHardWait.category).toBe('flakiness')
    expect(noHardWait.defaultSeverity).toBe('error')
  })
})

describe('no-css-class-selector — what the regex got wrong', () => {
  it('does not fire on a dot inside a quoted attribute value', () => {
    // `/\.[a-zA-Z_-]/` matched `.pdf` here and called it a class.
    expect(noCssClassSelector.evaluate(css('[href=".pdf"]'))).toBeNull()
    expect(noCssClassSelector.evaluate(css('a[download="report.v2.pdf"]'))).toBeNull()
  })

  it('does not fire on an id or a bare tag', () => {
    expect(noCssClassSelector.evaluate(css('#main'))).toBeNull()
    expect(noCssClassSelector.evaluate(css('button[type="submit"]'))).toBeNull()
  })

  it('treats an escaped dot as part of one class name', () => {
    const finding = noCssClassSelector.evaluate(css('.mt-1\\.5'))
    expect(finding?.message).toContain('.mt-1.5')
    expect(finding?.message).not.toContain('.5,')
  })

  it('names the classes it found', () => {
    expect(noCssClassSelector.evaluate(css('.a.b'))?.message).toContain('(.a, .b)')
  })

  it('finds a class in any selector of a list', () => {
    expect(noCssClassSelector.evaluate(css('#a, .b'))).not.toBeNull()
  })

  it('finds a class in any part of a >> chain', () => {
    expect(noCssClassSelector.evaluate(css('div >> .card'))).not.toBeNull()
  })

  it('does not fire on a non-css engine', () => {
    expect(noCssClassSelector.evaluate(css('text=Save file.txt'))).toBeNull()
    expect(noCssClassSelector.evaluate(css('//div[@class="a"]'))).toBeNull()
  })

  it('abstains rather than guessing when the selector will not parse', () => {
    expect(noCssClassSelector.evaluate(css('[unterminated'))).toBeNull()
    expect(noCssClassSelector.evaluate(css('.a >> [oops'))).toBeNull()
  })
})

describe('no-css-class-selector — nested selectors', () => {
  it('finds a class inside :has()', () => {
    // Real cal.com selector: `button:has(i.icon-dots-vertical)`.
    expect(noCssClassSelector.evaluate(css('button:has(i.icon-dots-vertical)'))).not.toBeNull()
  })

  it('finds a class inside :not() and :is()', () => {
    expect(noCssClassSelector.evaluate(css('div:not(.hidden)'))).not.toBeNull()
    expect(noCssClassSelector.evaluate(css('div:is(.a, .b)'))).not.toBeNull()
  })

  it('does not invent a class from :has-text()', () => {
    expect(noCssClassSelector.evaluate(css('button:has-text("save.all")'))).toBeNull()
  })
})

describe('avoid-positional-access', () => {
  it('flags .nth()', () => {
    expect(avoidPositionalAccess.evaluate(ctx({ apiCall: 'nth' }))?.message).toContain('.nth()')
  })

  it.each(['first', 'last'] as const)(
    'would flag .%s(), which the extractor does not yet emit',
    (apiCall) => {
      // Named as latent rather than asserted as behaviour: nothing in the
      // extractor produces these contexts, so a plain "flags .first()" test
      // could not fail on any real input.
      expect(avoidPositionalAccess.evaluate(ctx({ apiCall }))).not.toBeNull()
    },
  )

  it('is a warning, not an error — positional access over a repeated element is idiomatic', () => {
    expect(avoidPositionalAccess.defaultSeverity).toBe('warn')
  })

  it('does not fire on anything else', () => {
    expect(avoidPositionalAccess.evaluate(css('.a'))).toBeNull()
    expect(avoidPositionalAccess.evaluate(ctx({ apiCall: 'getByRole' }))).toBeNull()
  })
})

describe('avoid-parent-traversal', () => {
  it("flags locator('..')", () => {
    expect(avoidParentTraversal.evaluate(xpath('..'))).not.toBeNull()
  })

  it('does not fire on real XPath', () => {
    expect(avoidParentTraversal.evaluate(xpath('//button[@type="submit"]'))).toBeNull()
  })

  it('is info — it is a recognised Playwright idiom, not a hand-written path', () => {
    expect(avoidParentTraversal.defaultSeverity).toBe('info')
  })
})

describe('no-xpath after the split', () => {
  it("no longer fires on '..', so real XPath stands out", () => {
    expect(noXpath.evaluate(xpath('..'))).toBeNull()
  })

  it('still fires on a hand-written path', () => {
    expect(noXpath.evaluate(xpath('//div[@class="x"]/span[2]'))).not.toBeNull()
  })
})

describe('no-deep-css-chain after the split', () => {
  it('does not count a comma list as a chain', () => {
    // `strong em, em strong` is two one-step selectors, not a three-step chain.
    expect(noDeepCssChain.evaluate(css('strong em, em strong'))).toBeNull()
  })

  it('still flags a genuinely deep chain', () => {
    expect(noDeepCssChain.evaluate(css('header nav ul li a'))).not.toBeNull()
  })

  it('counts depth inside :has()', () => {
    // `b > c > d > e` is 3 combinator steps; `b > c > d` would be 2.
    expect(noDeepCssChain.evaluate(css('.a:has(b > c > d > e)'))).not.toBeNull()
    expect(noDeepCssChain.evaluate(css('.a:has(b > c)'))).toBeNull()
  })

  it('respects a configured threshold', () => {
    expect(noDeepCssChain.evaluate(css('a b c'), { maxChainDepth: 2 })).not.toBeNull()
    expect(noDeepCssChain.evaluate(css('a b c'), { maxChainDepth: 5 })).toBeNull()
  })

  it('names the depth it measured', () => {
    expect(noDeepCssChain.evaluate(css('header nav ul li a'))?.message).toContain('4 combinator')
  })
})

function xpath(selector: string): LocatorContext {
  return ctx({ selector, selectorEngine: 'xpath', parsed: tokenizeSelector(selector) })
}

describe('avoid-parent-traversal — repeated parent steps', () => {
  it('flags ../.. as parent traversal, not hand-written XPath', () => {
    expect(avoidParentTraversal.evaluate(xpath('../..'))).not.toBeNull()
    expect(noXpath.evaluate(xpath('../..'))).toBeNull()
  })

  it('leaves a real path to no-xpath', () => {
    expect(avoidParentTraversal.evaluate(xpath('../div'))).toBeNull()
    expect(noXpath.evaluate(xpath('../div'))).not.toBeNull()
  })
})

describe('no-deep-css-chain — same-element pseudos do not add depth', () => {
  // These pin the model the rule actually uses. An "accumulate through nesting"
  // version was written and reverted: `:not()`, `:is()` and `:where()` match the
  // SAME element, so adding a step for them reported `form .row > label:not(…)`
  // as three deep with a number that was simply wrong. Without these, that
  // implementation can be reinstated with the whole suite still green.
  it.each([
    ['form .row > label:not([hidden])', 2],
    ['.a .b > .c:not(.d)', 2],
    ['.a:is(.x, .y)', 0],
    ['div:is(.a .b) span', 1],
    ['.a:where(.x .y)', 1],
    ['input:right-of(.label)', 0],
    ['a:nth-child(2 of .foo)', 0],
  ])('%s is %i steps deep', (selector, expected) => {
    expect(maxChainDepth(tokenizeSelector(selector))).toBe(expected)
  })

  it('does not flag a selector whose depth comes from a same-element pseudo', () => {
    expect(noDeepCssChain.evaluate(css('form .row > label:not([hidden])'))).toBeNull()
    expect(noDeepCssChain.evaluate(css('.a .b > .c:not(.d)'))).toBeNull()
  })

  it('reports the deepest single selector, the documented under-count included', () => {
    // `.a b:has(c > d)` couples to a longer path than this; the floor is
    // deliberate, and stated in `depth.ts`. Pinned so it stays a decision.
    expect(maxChainDepth(tokenizeSelector('.a b:has(c > d)'))).toBe(1)
  })

  it('states in its message the same number it measured', () => {
    const finding = noDeepCssChain.evaluate(css('header nav ul li a'))
    expect(finding?.message).toContain(
      `${maxChainDepth(tokenizeSelector('header nav ul li a'))} combinator`,
    )
  })
})
