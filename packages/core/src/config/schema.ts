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

/**
 * A named tag set. `['a', '!b']` is sugar for `{ any: ['a'], none: ['b'] }`.
 *
 * `.strict()` on the object form so `{ al: [...] }` is a config error rather
 * than a suite that silently selects everything.
 */
export const suiteSchema = z.union([
  z.array(z.string()),
  z
    .object({
      /** Run tests carrying any of these. */
      any: z.array(z.string()).default([]),
      /** Run tests carrying every one of these. */
      all: z.array(z.string()).default([]),
      /** Skip tests carrying any of these. */
      none: z.array(z.string()).default([]),
    })
    .strict(),
])
export type SuiteDefinition = z.infer<typeof suiteSchema>

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
    /**
     * Named tag sets for `testpilot run --suite <name>`. Empty by default — a
     * project without tags gets no behaviour it did not ask for.
     *
     * The array form is any-of: `['regression', '!flaky']`. The object form
     * exists so all-of is expressible without a later breaking reinterpretation
     * of the array form: `{ all: ['regression', 'critical'], none: ['flaky'] }`.
     */
    suites: z.record(suiteSchema).default({}),
    rules: z.record(severitySchema).default({}),
    /**
     * Per-rule settings, separate from `rules` so a severity stays a severity.
     * Only rules with a genuine knob appear here.
     */
    ruleOptions: z
      .object({
        'no-deep-css-chain': z
          .object({
            /** Combinator steps at which a chain counts as deep. */
            maxChainDepth: z.number().int().min(1).max(20).default(3),
          })
          .strict()
          .default({}),
        'prefer-get-by-test-id': z
          .object({
            /**
             * Attribute names that count as a test id. Mirror the project's
             * Playwright `testIdAttribute` here; the default list is the three
             * spellings Playwright's own docs name.
             */
            testIdAttributes: z
              .array(z.string().min(1))
              .default(['data-testid', 'data-test-id', 'data-test']),
          })
          .strict()
          .default({}),
      })
      // Not `.strict()`: an unknown id here should warn like a typo in `rules`
      // does, not fail the whole config load. A rule that is renamed later
      // would otherwise hard-break every project that set an option on it.
      .passthrough()
      .default({}),
    scoring: scoringSchema,
    ai: aiSchema,
  })
  .strict()

export type TestPilotConfig = z.infer<typeof configSchema>
export type TestPilotConfigInput = z.input<typeof configSchema>

/** The fully-defaulted config used when no config file is present. */
export const defaultConfig: TestPilotConfig = configSchema.parse({})
