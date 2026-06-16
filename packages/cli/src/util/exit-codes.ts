/**
 * Documented process exit codes (see docs/CLI-Spec.md §7).
 */
export const ExitCode = {
  OK: 0,
  GATE_FAILED: 1,
  USAGE: 2,
  CONFIG: 3,
  ENV: 4,
  INTERNAL: 5,
  /** Temporary — placeholder commands during Milestone 1. */
  NOT_IMPLEMENTED: 64,
} as const

export type ExitCodeName = keyof typeof ExitCode
