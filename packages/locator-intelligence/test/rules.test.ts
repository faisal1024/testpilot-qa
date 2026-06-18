import { describe, expect, it } from 'vitest'
import type { LocatorContext } from '../src/locator-context.js'
import { noCssClassSelector } from '../src/rules/no-css-class-selector.js'
import { cssChainDepth, noDeepCssChain } from '../src/rules/no-deep-css-chain.js'
import { noHardWait } from '../src/rules/no-hard-wait.js'
import { noNthChild } from '../src/rules/no-nth-child.js'
import { noXpath } from '../src/rules/no-xpath.js'
import { preferUserFacingLocator } from '../src/rules/prefer-user-facing-locator.js'

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
  return ctx({ selector, selectorEngine: 'css' })
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
  it('flags .nth() chains', () => {
    expect(noNthChild.evaluate(ctx({ apiCall: 'nth' }))).not.toBeNull()
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
    expect(cssChainDepth('.a')).toBe(0)
    expect(cssChainDepth('div > button')).toBe(1)
    expect(cssChainDepth('#c > div > button')).toBe(2)
    expect(cssChainDepth('header nav ul li a')).toBe(4)
    // Spaces inside brackets/parens are not miscounted.
    expect(cssChainDepth('a[title="x y z"]')).toBe(0)
    expect(cssChainDepth('li:nth-child(2)')).toBe(0)
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
