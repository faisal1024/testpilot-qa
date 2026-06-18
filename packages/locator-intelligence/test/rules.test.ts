import { describe, expect, it } from 'vitest'
import type { LocatorContext } from '../src/locator-context.js'
import { noCssClassSelector } from '../src/rules/no-css-class-selector.js'
import { noXpath } from '../src/rules/no-xpath.js'

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

describe('no-xpath', () => {
  it('flags xpath selectors', () => {
    expect(noXpath.evaluate(ctx({ selector: '//div', selectorEngine: 'xpath' }))).not.toBeNull()
  })

  it('ignores css selectors', () => {
    expect(noXpath.evaluate(ctx({ selector: '.btn', selectorEngine: 'css' }))).toBeNull()
  })

  it('ignores dynamic selectors', () => {
    expect(noXpath.evaluate(ctx({ isDynamic: true, selectorEngine: 'xpath' }))).toBeNull()
  })

  it('declares an error default severity in the locator category', () => {
    expect(noXpath.defaultSeverity).toBe('error')
    expect(noXpath.category).toBe('locator')
  })
})

describe('no-css-class-selector', () => {
  it('flags leading class selectors', () => {
    expect(
      noCssClassSelector.evaluate(ctx({ selector: '.btn-primary', selectorEngine: 'css' })),
    ).not.toBeNull()
  })

  it('flags tag.class selectors', () => {
    expect(
      noCssClassSelector.evaluate(ctx({ selector: 'button.primary', selectorEngine: 'css' })),
    ).not.toBeNull()
  })

  it('ignores id and attribute selectors', () => {
    expect(
      noCssClassSelector.evaluate(ctx({ selector: '#submit', selectorEngine: 'css' })),
    ).toBeNull()
  })

  it('only applies to locator() css selectors', () => {
    expect(noCssClassSelector.evaluate(ctx({ apiCall: 'getByTestId', selector: '.x' }))).toBeNull()
    expect(
      noCssClassSelector.evaluate(ctx({ selector: 'text=.dot', selectorEngine: 'text' })),
    ).toBeNull()
  })
})
