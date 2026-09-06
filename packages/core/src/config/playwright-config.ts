import { createJiti } from 'jiti'

/**
 * The subset of a Playwright config TestPilot can reuse for file discovery.
 * Only glob-expressible values are returned — Playwright allows `RegExp` for
 * `testMatch`/`testIgnore`, which has no faithful glob translation.
 */
export interface PlaywrightTestSettings {
  testDir?: string
  testMatch?: string[]
  testIgnore?: string[]
}

function toGlobs(value: unknown): string[] | undefined {
  if (typeof value === 'string') {
    return [value]
  }
  if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string')) {
    return value as string[]
  }
  return undefined
}

/**
 * Reads `testDir` / `testMatch` / `testIgnore` from a Playwright config so a
 * project with no `testpilot.config.ts` still analyzes the suite Playwright runs.
 *
 * The config is user code that imports `@playwright/test`, so **any failure is
 * swallowed** and reported as "no settings": a project whose Playwright config
 * cannot be loaded here (missing dependency, a config that needs env we don't
 * have) must still get a working `analyze` on the built-in defaults.
 */
export async function readPlaywrightTestSettings(
  configPath: string,
): Promise<PlaywrightTestSettings | null> {
  let loaded: unknown
  try {
    const jiti = createJiti(configPath)
    loaded = await jiti.import(configPath, { default: true })
  } catch {
    return null
  }
  if (!loaded || typeof loaded !== 'object') {
    return null
  }
  const raw = loaded as Record<string, unknown>
  const settings: PlaywrightTestSettings = {}
  if (typeof raw.testDir === 'string' && raw.testDir.trim().length > 0) {
    settings.testDir = raw.testDir
  }
  const testMatch = toGlobs(raw.testMatch)
  if (testMatch) {
    settings.testMatch = testMatch
  }
  const testIgnore = toGlobs(raw.testIgnore)
  if (testIgnore) {
    settings.testIgnore = testIgnore
  }
  return Object.keys(settings).length > 0 ? settings : null
}
