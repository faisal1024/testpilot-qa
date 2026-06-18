import { describe, expect, it } from 'vitest'
import { extractLocators, inferEngine } from '../src/extractor.js'
import { parseSource } from '../src/parser.js'

function extract(code: string) {
  return extractLocators(code, parseSource(code, 'sample.spec.ts'))
}

describe('parseSource', () => {
  it('throws on a syntax error', () => {
    expect(() => parseSource('const = ;', 'broken.ts')).toThrow()
  })
})

describe('inferEngine', () => {
  it('detects engines from selector strings', () => {
    expect(inferEngine('//div')).toBe('xpath')
    expect(inferEngine('xpath=//div')).toBe('xpath')
    expect(inferEngine('text=Hello')).toBe('text')
    expect(inferEngine('.btn')).toBe('css')
    expect(inferEngine(undefined)).toBeUndefined()
  })
})

describe('extractLocators', () => {
  it('extracts every recognized locator call-site', () => {
    const code = [
      "import { test } from '@playwright/test'",
      "test('t', async ({ page }) => {",
      "  await page.locator('.btn-primary').click()",
      "  await page.locator('//button').click()",
      "  await page.getByRole('button', { name: 'Save' }).click()",
      "  await page.getByTestId('submit').click()",
      '  const sel = String(1)',
      '  await page.locator(sel).click()',
      '})',
    ].join('\n')

    const contexts = extract(code)
    expect(contexts).toHaveLength(5)

    const css = contexts[0]
    expect(css?.apiCall).toBe('locator')
    expect(css?.selector).toBe('.btn-primary')
    expect(css?.selectorEngine).toBe('css')
    expect(css?.isDynamic).toBe(false)
    expect(css?.raw).toBe("page.locator('.btn-primary')")
    expect(css?.line).toBe(3)
    expect(css?.column).toBeGreaterThan(0)

    expect(contexts[1]?.selectorEngine).toBe('xpath')
    expect(contexts[2]?.apiCall).toBe('getByRole')
    expect(contexts[2]?.selector).toBe('button')
    expect(contexts[2]?.selectorEngine).toBeUndefined()
    expect(contexts[3]?.apiCall).toBe('getByTestId')

    const dynamic = contexts[4]
    expect(dynamic?.apiCall).toBe('locator')
    expect(dynamic?.isDynamic).toBe(true)
    expect(dynamic?.selector).toBeUndefined()
  })

  it('reads no-substitution template literals as static selectors', () => {
    const contexts = extract('page.locator(`.card`)')
    expect(contexts[0]?.selector).toBe('.card')
    expect(contexts[0]?.isDynamic).toBe(false)
  })

  it('marks interpolated template literals as dynamic', () => {
    const contexts = extract('page.locator(`.card-${id}`)')
    expect(contexts[0]?.isDynamic).toBe(true)
    expect(contexts[0]?.selector).toBeUndefined()
  })

  it('ignores non-locator method calls', () => {
    expect(extract("page.goto('/home')")).toHaveLength(0)
  })
})
