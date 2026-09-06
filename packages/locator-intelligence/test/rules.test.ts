import { describe, expect, it } from 'vitest'
import type { LocatorContext } from '../src/locator-context.js'
import { avoidParentTraversal } from '../src/rules/avoid-parent-traversal.js'
import { avoidPositionalAccess } from '../src/rules/avoid-positional-access.js'
import { noCssClassSelector } from '../src/rules/no-css-class-selector.js'
import { noDeepCssChain } from '../src/rules/no-deep-css-chain.js'
import { noHardWait } from '../src/rules/no-hard-wait.js'
import { noNthChild } from '../src/rules/no-nth-child.js'
import { noXpath } from '../src/rules/no-xpath.js'
import { preferUserFacingLocator } from '../src/rules/prefer-user-facing-locator.js'
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

describe('prefer-user-facing-locator', () => {
  it('flags css and text engine locator() calls', () => {
    expect(preferUserFacingLocator.evaluate(css('#submit'))).not.toBeNull()
    expect(
      preferUserFacingLocator.evaluate(ctx({ selector: 'text=Hi', selectorEngine: 'text' })),
    ).not.toBeNull()
  })
  it('ignores xpath, dynamic, and non-locator APIs', () => {
    expect(
      preferUserFacingLocator.evaluate(ctx({ selector: '//a', selectorEngine: 'xpath' })),
    ).toBeNull()
    expect(preferUserFacingLocator.evaluate(ctx({ isDynamic: true }))).toBeNull()
    expect(
      preferUserFacingLocator.evaluate(ctx({ apiCall: 'getByRole', selector: 'button' })),
    ).toBeNull()
  })
  it('is warn severity', () => {
    expect(preferUserFacingLocator.defaultSeverity).toBe('warn')
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
