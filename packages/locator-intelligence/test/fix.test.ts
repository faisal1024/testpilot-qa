import { describe, expect, it } from 'vitest'
import { computeFixes, plainTextSelectorValue } from '../src/fix.js'

const FILE = 'tests/a.spec.ts'

describe('plainTextSelectorValue', () => {
  it('accepts a plain text= selector', () => {
    expect(plainTextSelectorValue('text=Submit')).toBe('Submit')
    expect(plainTextSelectorValue('text=Add to cart')).toBe('Add to cart')
  })

  it('rejects ambiguous or unsafe selectors (skip, do not rewrite)', () => {
    expect(plainTextSelectorValue('.btn-primary')).toBeNull() // not a text selector
    expect(plainTextSelectorValue('text="Exact"')).toBeNull() // quoted = exact
    expect(plainTextSelectorValue("text='Exact'")).toBeNull()
    expect(plainTextSelectorValue('text=/regex/')).toBeNull() // regex form
    expect(plainTextSelectorValue('text=a >> text=b')).toBeNull() // chained
    expect(plainTextSelectorValue("text=it's")).toBeNull() // unsafe to re-quote
    expect(plainTextSelectorValue('text=')).toBeNull() // empty
  })
})

describe('computeFixes', () => {
  it('rewrites locator(text=) to getByText() and reports the change', () => {
    const code = "await page.locator('text=Submit').click()\n"
    const { output, fixes } = computeFixes(code, FILE)
    expect(output).toBe("await page.getByText('Submit').click()\n")
    expect(fixes).toHaveLength(1)
    expect(fixes[0]).toMatchObject({
      kind: 'text-engine-to-get-by-text',
      line: 1,
      before: "page.locator('text=Submit')",
      after: "page.getByText('Submit')",
    })
  })

  it('normalizes double-quoted selectors to single-quoted getByText', () => {
    const { output } = computeFixes('page.locator("text=Submit")\n', FILE)
    expect(output).toBe("page.getByText('Submit')\n")
  })

  it('leaves unsupported selectors untouched (no accidental rewrites)', () => {
    const samples = [
      "page.locator('.btn-primary')\n",
      "page.locator('//button')\n",
      'page.locator(\'text="Exact"\')\n',
      "page.locator('text=a >> text=b')\n",
      'page.locator(`text=${name}`)\n', // dynamic
      'page.waitForTimeout(1000)\n',
    ]
    for (const code of samples) {
      const { output, fixes } = computeFixes(code, FILE)
      expect(output).toBe(code)
      expect(fixes).toHaveLength(0)
    }
  })

  it('is idempotent — re-running on the output makes no further change', () => {
    const code = "page.locator('text=Save').click()\n"
    const first = computeFixes(code, FILE)
    const second = computeFixes(first.output, FILE)
    expect(second.output).toBe(first.output)
    expect(second.fixes).toHaveLength(0)
  })

  it('preserves line count and fixes every occurrence (incl. chained calls)', () => {
    const code = [
      "test('x', async ({ page }) => {",
      "  await page.locator('text=One').click()",
      "  await page.getByRole('list').locator('text=Two').click()",
      '})',
      '',
    ].join('\n')
    const { output, fixes } = computeFixes(code, FILE)
    expect(fixes).toHaveLength(2)
    expect(output.split('\n')).toHaveLength(code.split('\n').length) // no lines added/removed
    expect(output).toContain("page.getByText('One')")
    expect(output).toContain("getByRole('list').getByText('Two')")
  })

  it('preserves CRLF line endings on untouched lines', () => {
    const code =
      "import { test } from '@playwright/test'\r\nawait page.locator('text=Go').click()\r\n"
    const { output } = computeFixes(code, FILE)
    expect(output).toBe(
      "import { test } from '@playwright/test'\r\nawait page.getByText('Go').click()\r\n",
    )
  })

  it('applies two fixes on the same line correctly', () => {
    const code = "await page.locator('text=A').or(page.locator('text=B')).click()\n"
    const { output, fixes } = computeFixes(code, FILE)
    expect(fixes).toHaveLength(2)
    expect(output).toBe("await page.getByText('A').or(page.getByText('B')).click()\n")
  })

  it('throws on a parse error (caller skips the file)', () => {
    expect(() => computeFixes('const x = (', FILE)).toThrow()
  })
})
