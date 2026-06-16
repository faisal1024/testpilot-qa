/**
 * Library entry for `testpilot-qa`.
 *
 * This module is intentionally free of side effects so that a user's
 * `testpilot.config.ts` can `import { defineConfig } from 'testpilot-qa'`
 * without executing the CLI. The CLI itself lives in `./cli.ts` (the package
 * `bin`).
 */
export { defineConfig } from '@testpilot/core'
export type { Severity, TestPilotConfig, TestPilotConfigInput } from '@testpilot/core'
