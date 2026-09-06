/** Where a discovery setting (`testDir` / `include` / `exclude`) actually came from. */
export type DiscoverySource = 'testpilot-config' | 'playwright-config' | 'mixed' | 'default'

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
   * Set when a Playwright config was found and **nothing** could be taken from it
   * (an unparseable file, an ambiguous location, no readable `testDir`). Never
   * silently ignored: the reason is surfaced in the zero-file error and by `doctor`.
   */
  playwrightConfigIgnored: { path: string; reason: string } | null
  /**
   * Set when a Playwright config **was** used but part of it could not be read.
   * Distinct from {@link playwrightConfigIgnored}: telling a user their config "was
   * not used" on a run that used it sends them to fix a problem they don't have.
   */
  playwrightConfigPartial: { path: string; reason: string } | null
}

export const DEFAULT_DISCOVERY: ConfigDiscovery = {
  testDir: 'default',
  include: 'default',
  exclude: 'default',
  roots: [],
  playwrightConfigPath: null,
  playwrightConfigIgnored: null,
  playwrightConfigPartial: null,
}

/** Human-readable provenance for one setting — the single source of this wording. */
export function formatDiscoverySource(
  discovery: ConfigDiscovery,
  key: 'testDir' | 'include' | 'exclude',
): string {
  switch (discovery[key]) {
    case 'playwright-config':
      return `from ${discovery.playwrightConfigPath ?? 'the Playwright config'}`
    case 'mixed':
      return `partly from ${discovery.playwrightConfigPath ?? 'the Playwright config'}, partly built-in default`
    case 'testpilot-config':
      return 'from testpilot.config'
    default:
      return 'built-in default'
  }
}

/**
 * Where suites conventionally keep page objects, fixtures and helpers. Used by
 * `--with-helpers` when the project has not named its own locations.
 *
 * Directory names are only a hint — `pages/` is Next.js's and Nuxt's route directory,
 * `helpers/` is Ember's — so a candidate is also required to actually use Playwright
 * before it is analyzed, which is what makes listing `pages/` safe here.
 *
 * `lib/` and `utils/` are still left out: they are broad enough that scanning them on
 * every run costs more than it returns. Suites that keep page objects there (mattermost
 * uses `lib/src/ui/`) should name their own `includeHelpers` list.
 */
export const DEFAULT_HELPER_PATTERNS = [
  '**/pages/**',
  '**/page-objects/**',
  '**/pageobjects/**',
  '**/pom/**',
  '**/fixtures/**',
  '**/helpers/**',
  '**/support/**',
]
