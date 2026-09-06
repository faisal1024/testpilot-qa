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
  type AnalysisWarning,
  type BaselineReport,
  type Finding,
  type FindingSeverity,
  type Grade,
  type ParseError,
  type QualityScore,
  type RuleCategory,
  type RuleExplanation,
  type ScoreBreakdown,
  type SubScores,
} from './analysis/types.js'
export {
  type Baseline,
  BASELINE_SCHEMA_VERSION,
  type BaselineComparison,
  type BaselineEntry,
  buildBaseline,
  compareToBaseline,
  findingKey,
} from './baseline/baseline.js'

export { defineConfig } from './config/define-config.js'
export {
  type ConfigDiscovery,
  DEFAULT_DISCOVERY,
  DEFAULT_HELPER_PATTERNS,
  type DiscoverySource,
  formatDiscoverySource,
} from './config/discovery.js'
export {
  type PathPattern,
  type PlaywrightConfigRead,
  type PlaywrightScope,
  type PlaywrightTestSettings,
  readPlaywrightTestSettings,
} from './config/playwright-config.js'
export {
  type DiscoveryScope,
  type RegexPattern,
  describeRoots,
  findPlaywrightConfigNearby,
  type ResolveDiscoveryOptions,
  type ResolvedDiscovery,
  resolveDiscovery,
} from './config/resolve-discovery.js'
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
  type BuildTagSelectionInput,
  buildTagSelection,
  describeTagSelection,
  escapeForRegExp,
  findConflictingGrep,
  isEmptySelection,
  parseTagToken,
  splitTagList,
  type TagName,
  tagPattern,
  type TagSelection,
  TagSelectionError,
  tagSelectionArgs,
} from './tags/tag-selection.js'
export {
  expandSuites,
  isValidSuiteName,
  selectionInputFor,
  type SuiteMap,
} from './tags/suites.js'
export {
  type SuiteUsage,
  TAGS_SCHEMA_VERSION,
  type TagUsage,
  type TagsReport,
  type TagsSummary,
} from './tags/report.js'
export {
  type SuiteIssue,
  unknownSuiteTags,
  validateSuites,
} from './tags/validate-suites.js'
export {
  type CheckStatus,
  DOCTOR_SCHEMA_VERSION,
  type DoctorCategory,
  type DoctorCheck,
  type DoctorOptions,
  type DoctorReport,
  runDoctor,
} from './doctor/run-doctor.js'
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
