import { existsSync, statSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { createJiti } from 'jiti'
import { ConfigError } from './errors.js'
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
    return { config: configSchema.parse({}), filepath: null }
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

  return { config: parsed.data, filepath }
}
