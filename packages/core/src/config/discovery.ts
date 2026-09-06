/** Where a discovery setting (`testDir` / `include` / `exclude`) actually came from. */
export type DiscoverySource = 'testpilot-config' | 'playwright-config' | 'default'

/**
 * How the files to analyze were selected. Reported by `analyze` (in the JSON
 * envelope, under `--verbose`, and on stderr whenever another tool's config
 * supplied a setting) and by `doctor`, so "why did it look there?" is always
 * answerable without guessing.
 */
export interface ConfigDiscovery {
  testDir: DiscoverySource
  include: DiscoverySource
  exclude: DiscoverySource
  /**
   * Absolute directories actually scanned. Populated whenever discovery resolved
   * them — a Playwright suite can declare several via `projects[]`, which no
   * single `config.testDir` string can represent. Every message that names a test
   * directory renders these, so the label can never disagree with what was read.
   */
  roots: string[]
  /** Playwright config that actually supplied a setting, or `null`. */
  playwrightConfigPath: string | null
  /**
   * Set when a Playwright config was found but nothing usable could be taken from
   * it (computed values, a spread, an unparseable file, an ambiguous location).
   * Never silently ignored: the reason is surfaced in the zero-file error, by
   * `doctor`, and in the report.
   */
  playwrightConfigIgnored: { path: string; reason: string } | null
}

export const DEFAULT_DISCOVERY: ConfigDiscovery = {
  testDir: 'default',
  include: 'default',
  exclude: 'default',
  roots: [],
  playwrightConfigPath: null,
  playwrightConfigIgnored: null,
}

/** Human-readable provenance for one setting — the single source of this wording. */
export function formatDiscoverySource(
  discovery: ConfigDiscovery,
  key: 'testDir' | 'include' | 'exclude',
): string {
  switch (discovery[key]) {
    case 'playwright-config':
      return `from ${discovery.playwrightConfigPath ?? 'the Playwright config'}`
    case 'testpilot-config':
      return 'from testpilot.config'
    default:
      return 'built-in default'
  }
}
