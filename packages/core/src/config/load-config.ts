import { existsSync, statSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { createJiti } from 'jiti'
import { findPlaywrightConfig, findProjectRoot } from '../project/discovery.js'
import { type ConfigDiscovery, DEFAULT_DISCOVERY } from './discovery.js'
import { ConfigError } from './errors.js'
import { readPlaywrightTestSettings } from './playwright-config.js'
import { type TestPilotConfig, configSchema } from './schema.js'

const CONFIG_BASENAMES = [
  'testpilot.config.ts',
  'testpilot.config.mts',
  'testpilot.config.js',
  'testpilot.config.mjs',
  'testpilot.config.cjs',
]

export interface LoadConfigOptions {
  /** Directory to start discovery from. Defaults to `process.cwd()`. */
  cwd?: string
  /** Explicit config path. When set, discovery is skipped. */
  configPath?: string
}

export interface LoadConfigResult {
  config: TestPilotConfig
  /** Absolute path of the loaded file, or `null` when defaults were used. */
  filepath: string | null
  /** Where `testDir` / `include` came from — see {@link ConfigDiscovery}. */
  discovery: ConfigDiscovery
}

/**
 * Fills `testDir` / `include` from the project's Playwright config for any key the
 * user did not set explicitly, so a repo with no `testpilot.config.ts` analyzes the
 * suite Playwright actually runs (cal.com's `*.e2e.ts` and immich's `*.e2e-spec.ts`
 * matched nothing under the built-in defaults). An explicit TestPilot setting always
 * wins; `testIgnore` is appended to `exclude` rather than replacing it.
 */
async function applyPlaywrightDiscovery(
  config: TestPilotConfig,
  explicitKeys: Set<string>,
  root: string,
): Promise<ConfigDiscovery> {
  const discovery: ConfigDiscovery = {
    testDir: explicitKeys.has('testDir') ? 'testpilot-config' : 'default',
    include: explicitKeys.has('include') ? 'testpilot-config' : 'default',
    playwrightConfigPath: null,
  }
  if (discovery.testDir !== 'default' && discovery.include !== 'default') {
    return discovery
  }
  const playwrightConfigPath = findPlaywrightConfig(root, config.playwrightConfig)
  if (!playwrightConfigPath) {
    return discovery
  }
  const settings = await readPlaywrightTestSettings(playwrightConfigPath)
  if (!settings) {
    return discovery
  }
  discovery.playwrightConfigPath = playwrightConfigPath
  if (discovery.testDir === 'default' && settings.testDir) {
    config.testDir = settings.testDir
    discovery.testDir = 'playwright-config'
  }
  if (discovery.include === 'default' && settings.testMatch) {
    config.include = settings.testMatch
    discovery.include = 'playwright-config'
  }
  if (settings.testIgnore && !explicitKeys.has('exclude')) {
    config.exclude = [...config.exclude, ...settings.testIgnore]
  }
  return discovery
}

/** Walks up from `cwd` looking for a `testpilot.config.*` file. */
export function findConfigFile(cwd: string): string | null {
  let dir = resolve(cwd)
  for (;;) {
    for (const name of CONFIG_BASENAMES) {
      const candidate = resolve(dir, name)
      if (existsSync(candidate)) {
        return candidate
      }
    }
    const parent = dirname(dir)
    if (parent === dir) {
      return null
    }
    dir = parent
  }
}

/**
 * Loads and validates the TestPilot config. Returns fully-defaulted config when
 * no file is found. Throws {@link ConfigError} on load or validation failure.
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadConfigResult> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd()
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
    throw new ConfigError(`Working directory does not exist: ${cwd}`)
  }

  let filepath: string | null
  if (options.configPath) {
    filepath = isAbsolute(options.configPath)
      ? options.configPath
      : resolve(cwd, options.configPath)
    if (!existsSync(filepath)) {
      throw new ConfigError(`Config file not found: ${filepath}`)
    }
  } else {
    filepath = findConfigFile(cwd)
  }

  if (!filepath) {
    const config = configSchema.parse({})
    const discovery = await applyPlaywrightDiscovery(config, new Set(), findProjectRoot(cwd))
    return { config, filepath: null, discovery }
  }

  let loaded: unknown
  try {
    const jiti = createJiti(filepath)
    loaded = await jiti.import(filepath, { default: true })
  } catch (error) {
    throw new ConfigError(`Failed to load config file: ${filepath}`, { cause: error })
  }

  const parsed = configSchema.safeParse(loaded ?? {})
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new ConfigError(`Invalid TestPilot config in ${filepath}:\n${issues}`)
  }

  const explicitKeys = new Set(
    loaded && typeof loaded === 'object' ? Object.keys(loaded as object) : [],
  )
  const discovery = await applyPlaywrightDiscovery(parsed.data, explicitKeys, dirname(filepath))
  return { config: parsed.data, filepath, discovery }
}

export { DEFAULT_DISCOVERY }
