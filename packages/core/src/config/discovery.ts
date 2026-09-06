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
  /** Playwright config that actually supplied a setting, or `null`. */
  playwrightConfigPath: string | null
  /**
   * Set when a Playwright config was found but nothing usable could be read from
   * it (computed values, an unparseable file). Never silently ignored: the reason
   * is surfaced in the zero-file error and by `doctor`.
   */
  playwrightConfigIgnored: { path: string; reason: string } | null
}

export const DEFAULT_DISCOVERY: ConfigDiscovery = {
  testDir: 'default',
  include: 'default',
  exclude: 'default',
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
