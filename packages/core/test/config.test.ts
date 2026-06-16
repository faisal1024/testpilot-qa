import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ConfigError,
  configSchema,
  defaultConfig,
  defineConfig,
  findConfigFile,
  loadConfig,
} from '../src/index.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'testpilot-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function writeConfig(targetDir: string, source: string): string {
  const file = join(targetDir, 'testpilot.config.ts')
  writeFileSync(file, source)
  return file
}

describe('defaultConfig', () => {
  it('applies sensible defaults', () => {
    expect(defaultConfig.testDir).toBe('tests')
    expect(defaultConfig.include).toEqual(['**/*.spec.ts', '**/*.test.ts'])
    expect(defaultConfig.scoring.minScore).toBe(80)
    expect(defaultConfig.scoring.weights).toEqual({ error: 5, warn: 2, info: 0.5 })
    expect(defaultConfig.ai.agents).toEqual(['claude'])
  })
})

describe('defineConfig', () => {
  it('returns its input unchanged', () => {
    const input = { testDir: 'e2e' }
    expect(defineConfig(input)).toBe(input)
  })
})

describe('configSchema', () => {
  it('rejects an out-of-range minScore', () => {
    const result = configSchema.safeParse({ scoring: { minScore: 150 } })
    expect(result.success).toBe(false)
  })
})

describe('loadConfig', () => {
  it('returns defaults when no config file is found', async () => {
    const { config, filepath } = await loadConfig({ cwd: dir })
    expect(filepath).toBeNull()
    expect(config).toEqual(defaultConfig)
  })

  it('loads and merges a config file with defaults', async () => {
    const file = writeConfig(dir, "export default { testDir: 'e2e', scoring: { minScore: 90 } }\n")
    const { config, filepath } = await loadConfig({ cwd: dir })
    expect(filepath).toBe(file)
    expect(config.testDir).toBe('e2e')
    expect(config.scoring.minScore).toBe(90)
    // Untouched fields still fall back to defaults.
    expect(config.scoring.weights.error).toBe(5)
    expect(config.include).toEqual(['**/*.spec.ts', '**/*.test.ts'])
  })

  it('discovers a config file in a parent directory', async () => {
    const nested = join(dir, 'a', 'b')
    mkdirSync(nested, { recursive: true })
    const file = writeConfig(dir, "export default { testDir: 'fromParent' }\n")
    expect(findConfigFile(nested)).toBe(file)
    const { config } = await loadConfig({ cwd: nested })
    expect(config.testDir).toBe('fromParent')
  })

  it('throws ConfigError on an invalid config', async () => {
    writeConfig(dir, 'export default { scoring: { minScore: 150 } }\n')
    await expect(loadConfig({ cwd: dir })).rejects.toBeInstanceOf(ConfigError)
  })

  it('throws ConfigError when an explicit config path is missing', async () => {
    await expect(
      loadConfig({ cwd: dir, configPath: 'does-not-exist.config.ts' }),
    ).rejects.toBeInstanceOf(ConfigError)
  })

  it('throws ConfigError when the cwd does not exist', async () => {
    await expect(loadConfig({ cwd: join(dir, 'nope') })).rejects.toBeInstanceOf(ConfigError)
  })
})
