/**
 * @testpilot/core — shared types and utilities.
 *
 * Milestone 2 added the configuration surface (schema, loader, helpers).
 * Milestone 2.5 added project discovery and the Playwright pass-through runner.
 * Milestone 3A adds the shared analysis contract (Finding, AnalysisReport).
 */

export const VERSION = '0.0.0'

export {
  ANALYSIS_SCHEMA_VERSION,
  type AnalysisReport,
  type AnalysisSummary,
  type Finding,
  type FindingSeverity,
  type RuleCategory,
} from './analysis/types.js'

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
export {
  findPlaywrightConfig,
  findProjectRoot,
  findUp,
  isDirectory,
  resolvePlaywrightBin,
} from './project/discovery.js'
export {
  buildPlaywrightArgs,
  defaultProcessRunner,
  type ProcessRunner,
  runPlaywright,
  type RunPlaywrightOptions,
} from './project/run-playwright.js'
