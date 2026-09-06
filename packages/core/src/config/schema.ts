import { z } from 'zod'

/** Per-rule severity. `off` disables a rule. */
export const severitySchema = z.enum(['off', 'info', 'warn', 'error'])
export type Severity = z.infer<typeof severitySchema>

export const scoringSchema = z
  .object({
    // Optional on purpose: when unset (and no --min-score flag), `analyze` does
    // not gate. A default here would silently gate every run.
    minScore: z.number().min(0).max(100).optional(),
    weights: z
      .object({
        error: z.number().nonnegative().default(5),
        warn: z.number().nonnegative().default(2),
        info: z.number().nonnegative().default(0.5),
      })
      .default({}),
  })
  .default({})

export const aiSchema = z
  .object({
    // All supported agents by default — generated projects include every guidance file.
    agents: z
      .array(z.enum(['claude', 'codex', 'cursor', 'copilot']))
      .default(['claude', 'codex', 'cursor', 'copilot']),
  })
  .default({})

/**
 * The TestPilot configuration shape (see docs/CLI-Spec.md §4).
 *
 * Milestone 2.5 adds `playwrightConfig` (used by `testpilot run`). Rules,
 * scoring, and AI fields describe the surface for later milestones; none of
 * those features are implemented yet.
 *
 * Unknown top-level keys are **rejected** (`.strict()`) so typos surface
 * immediately rather than being silently ignored. New fields are added to this
 * schema as features land.
 */
export const configSchema = z
  .object({
    testDir: z.string().default('tests'),
    playwrightConfig: z.string().default('playwright.config.ts'),
    // Every extension the parser handles and the common suffixes seen in real suites
    // (`*.e2e.ts`, `*.e2e-spec.ts`) — a JS suite must not silently match nothing.
    include: z
      .array(z.string())
      .default(['**/*.{spec,test,e2e,e2e-spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']),
    // Build output of a TS suite would otherwise be analyzed twice (and show up as
    // "new" findings against a baseline) now that `.js` is in the default include.
    exclude: z
      .array(z.string())
      .default([
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/coverage/**',
        '**/test-results/**',
        '**/playwright-report/**',
      ]),
    /**
     * Page objects, fixtures and helpers — where real suites keep their locators, and
     * where Playwright's own `testMatch` never looks. Empty by default: these files
     * are not tests, so including them changes what the score is measuring. Setting
     * this, or passing `--with-helpers`, turns it on.
     */
    includeHelpers: z.array(z.string()).default([]),
    rules: z.record(severitySchema).default({}),
    scoring: scoringSchema,
    ai: aiSchema,
  })
  .strict()

export type TestPilotConfig = z.infer<typeof configSchema>
export type TestPilotConfigInput = z.input<typeof configSchema>

/** The fully-defaulted config used when no config file is present. */
export const defaultConfig: TestPilotConfig = configSchema.parse({})
