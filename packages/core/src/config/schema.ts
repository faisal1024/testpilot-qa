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
    agents: z.array(z.enum(['claude', 'codex', 'cursor', 'copilot'])).default(['claude']),
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
    include: z.array(z.string()).default(['**/*.spec.ts', '**/*.test.ts']),
    rules: z.record(severitySchema).default({}),
    scoring: scoringSchema,
    ai: aiSchema,
  })
  .strict()

export type TestPilotConfig = z.infer<typeof configSchema>
export type TestPilotConfigInput = z.input<typeof configSchema>

/** The fully-defaulted config used when no config file is present. */
export const defaultConfig: TestPilotConfig = configSchema.parse({})
