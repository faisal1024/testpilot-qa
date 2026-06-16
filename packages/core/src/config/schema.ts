import { z } from 'zod'

/** Per-rule severity. `off` disables a rule. */
export const severitySchema = z.enum(['off', 'info', 'warn', 'error'])
export type Severity = z.infer<typeof severitySchema>

export const scoringSchema = z
  .object({
    minScore: z.number().min(0).max(100).default(80),
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
 * Milestone 2 defines the config surface and validation only — none of the
 * referenced features (rules, scoring) are implemented yet.
 */
export const configSchema = z.object({
  testDir: z.string().default('tests'),
  include: z.array(z.string()).default(['**/*.spec.ts', '**/*.test.ts']),
  rules: z.record(severitySchema).default({}),
  scoring: scoringSchema,
  ai: aiSchema,
})

export type TestPilotConfig = z.infer<typeof configSchema>
export type TestPilotConfigInput = z.input<typeof configSchema>

/** The fully-defaulted config used when no config file is present. */
export const defaultConfig: TestPilotConfig = configSchema.parse({})
