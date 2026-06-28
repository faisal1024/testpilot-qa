import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Because the published `testpilot-qa` bundles the internal `@testpilot/*`
 * packages (tsup `noExternal`), the real npm deps those packages use must be
 * re-declared on the CLI. These specifiers are duplicated, so this test keeps
 * them from drifting apart — a bump in the owning package must be mirrored here.
 */
function pkg(relativePath: string): { dependencies?: Record<string, string> } {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8'))
}

const cli = pkg('../package.json')
const core = pkg('../../core/package.json')
const locatorIntelligence = pkg('../../locator-intelligence/package.json')

describe('CLI re-declared dependency versions stay in sync with their owners', () => {
  it.each([
    ['zod', core],
    ['jiti', core],
    ['tinyglobby', locatorIntelligence],
    ['@typescript-eslint/parser', locatorIntelligence],
  ])('%s matches the owning package', (dep, owner) => {
    const cliVersion = cli.dependencies?.[dep]
    const ownerVersion = owner.dependencies?.[dep]
    expect(ownerVersion, `${dep} not found in the owning package`).toBeDefined()
    expect(cliVersion, `${dep} must be declared on testpilot-qa (it is bundled)`).toBe(ownerVersion)
  })
})
