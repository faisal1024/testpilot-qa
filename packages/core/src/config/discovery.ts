/** Where a discovery setting (`testDir` / `include`) actually came from. */
export type DiscoverySource = 'testpilot-config' | 'playwright-config' | 'default'

/**
 * How the files to analyze were selected. Reported by `analyze` (in the JSON
 * envelope and under `--verbose`) and by `doctor`, so "why did it look there?"
 * is always answerable without guessing.
 */
export interface ConfigDiscovery {
  testDir: DiscoverySource
  include: DiscoverySource
  /** Playwright config consulted for discovery, or `null` when none was used. */
  playwrightConfigPath: string | null
}

/** Discovery result for a run that used only built-in defaults. */
export const DEFAULT_DISCOVERY: ConfigDiscovery = {
  testDir: 'default',
  include: 'default',
  playwrightConfigPath: null,
}
