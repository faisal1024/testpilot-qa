import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { tokenizeSelector } from '../src/selector/tokenize.js'

/**
 * Pins the hand-written tokenizer to Playwright's own parser.
 *
 * A hand-rolled parser for someone else's syntax drifts. This is the artifact
 * that makes maintaining one defensible: it asserts, over every selector in the
 * corpus, that **we never accept what Playwright rejects** — the direction that
 * would let a rule report a finding on a selector that cannot even run.
 *
 * The other direction (we abstain where Playwright parses) is a lost finding,
 * not a false one, so it is allowed and merely counted.
 */
const corpus = fileURLToPath(new URL('../../../.bench-cache/', import.meta.url))

/** Playwright's parser, from its internal bundle. A devDependency — never shipped. */
async function loadPlaywrightParser(): Promise<((selector: string) => unknown) | null> {
  try {
    // A devDependency used purely as an oracle; never reachable from the
    // published bundle (the CLI's tsup config bundles only `@testpilot/*`).
    const bundle = await import('playwright-core/lib/coreBundle')
    return bundle.iso?.parseSelector ?? null
  } catch {
    return null
  }
}

function corpusSelectors(): string[] {
  let files: string[]
  try {
    files = execSync(
      `find ${JSON.stringify(corpus)} \\( -name '*.spec.ts' -o -name '*.e2e.ts' -o -name '*.spec.js' \\) 2>/dev/null`,
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    )
      .split('\n')
      .filter(Boolean)
  } catch {
    return []
  }
  const selectors = new Set<string>()
  for (const file of files) {
    let source: string
    try {
      source = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    // One pattern per quote style: a single-quoted selector routinely contains
    // double quotes (`[href=".pdf"]`), so a combined character class excludes
    // exactly the selectors most worth checking.
    const patterns = [
      /\.(?:locator|frameLocator)\(\s*'([^'\\\n]*)'/g,
      /\.(?:locator|frameLocator)\(\s*"([^"\\\n]*)"/g,
      /\.(?:locator|frameLocator)\(\s*`([^`\\\n$]*)`/g,
    ]
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        if (match[1]) {
          selectors.add(match[1])
        }
      }
    }
  }
  return [...selectors]
}

const parser = await loadPlaywrightParser()
const selectors = corpusSelectors()
/** The corpus is a cached checkout; a contributor may not have it locally. */
const available = parser !== null && selectors.length > 0

describe('differential against real Playwright', () => {
  // OUTSIDE the skip, deliberately. With the guard inside it, a missing corpus
  // skipped the whole file *green* — and this file is the argument for
  // maintaining a hand-written parser at all, so a silent skip in CI made that
  // argument vacuous.
  it('runs for real wherever the corpus is available', () => {
    // Gated on an explicit env var, not on `CI`: the `verify` job has no corpus
    // (it is a cached five-repo checkout) and must not go red for its absence,
    // while the `bench` job — which does have it — sets this and so cannot
    // skip silently. Keying on "is the corpus there?" alone let the file pass
    // green while skipped, which made it no evidence at all.
    if (process.env.TESTPILOT_DIFFERENTIAL === '1') {
      expect(parser, 'playwright-core must resolve').not.toBeNull()
      expect(selectors.length, 'the .bench-cache corpus must be present').toBeGreaterThan(500)
    }
    expect(true).toBe(true)
  })

  it.skipIf(!available)('never accepts a selector Playwright rejects', () => {
    const wrong: string[] = []
    for (const selector of selectors) {
      let playwrightAccepts = true
      try {
        parser?.(selector)
      } catch {
        playwrightAccepts = false
      }
      const weAccept = tokenizeSelector(selector).unparsed.length === 0
      if (weAccept && !playwrightAccepts) {
        wrong.push(selector)
      }
    }
    expect(wrong, `accepted but Playwright rejects:\n${wrong.join('\n')}`).toEqual([])
  })

  it.skipIf(!available)('reports how often it abstains where Playwright parses', () => {
    // Allowed — a lost finding, not a false one — but tracked so a refactor
    // that quietly doubles it is visible in review.
    const abstained = selectors.filter((selector) => {
      try {
        parser?.(selector)
      } catch {
        return false
      }
      return tokenizeSelector(selector).unparsed.length > 0
    })
    expect(abstained.length / selectors.length).toBeLessThan(0.02)
  })
})
