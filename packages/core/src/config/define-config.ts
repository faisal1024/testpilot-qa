import type { TestPilotConfigInput } from './schema.js'

/**
 * Identity helper that gives editors full type-checking and autocomplete for
 * `testpilot.config.ts`:
 *
 * ```ts
 * import { defineConfig } from 'testpilot-qa'
 * export default defineConfig({ testDir: 'tests' })
 * ```
 */
export function defineConfig(config: TestPilotConfigInput): TestPilotConfigInput {
  return config
}
