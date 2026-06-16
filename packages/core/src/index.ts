/**
 * @testpilot/core — shared types and utilities.
 *
 * Milestone 2 adds the configuration surface (schema, loader, helpers).
 * Feature types (Finding, LocatorContext, Rule, Reporter, …) arrive in their
 * respective phases.
 */

export const VERSION = '0.0.0'

export { defineConfig } from './config/define-config.js'
export { ConfigError } from './config/errors.js'
export {
  findConfigFile,
  type LoadConfigOptions,
  type LoadConfigResult,
  loadConfig,
} from './config/load-config.js'
export {
  aiSchema,
  configSchema,
  defaultConfig,
  scoringSchema,
  type Severity,
  severitySchema,
  type TestPilotConfig,
  type TestPilotConfigInput,
} from './config/schema.js'
