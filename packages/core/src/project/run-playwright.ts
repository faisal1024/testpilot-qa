import { spawn } from 'node:child_process'

/**
 * Runs a command and resolves with its exit code. Injectable so callers (and
 * tests) can substitute a controlled process invocation.
 */
export type ProcessRunner = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<number>

/** Default runner: spawns the command, inheriting stdio, and resolves its exit code. */
export const defaultProcessRunner: ProcessRunner = (command, args, options) =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, stdio: 'inherit' })
    child.on('error', reject)
    child.on('close', (code) => resolvePromise(code ?? 1))
  })

export interface RunPlaywrightOptions {
  /** Directory the Playwright process runs in. */
  projectRoot: string
  /** Absolute path to the local Playwright binary. */
  binPath: string
  /** Explicit Playwright config path, or `null` to use Playwright's own discovery. */
  playwrightConfigPath: string | null
  /** Extra arguments forwarded verbatim to `playwright test`. */
  forwardedArgs: string[]
}

/** Builds the argument vector passed to the Playwright binary. */
export function buildPlaywrightArgs(options: RunPlaywrightOptions): string[] {
  const args = ['test']
  if (options.playwrightConfigPath) {
    args.push('--config', options.playwrightConfigPath)
  }
  args.push(...options.forwardedArgs)
  return args
}

/**
 * Executes `playwright test` as a thin pass-through and resolves Playwright's
 * exit code. TestPilot adds no execution semantics of its own — Playwright
 * remains the runner.
 */
export async function runPlaywright(
  options: RunPlaywrightOptions,
  runner: ProcessRunner = defaultProcessRunner,
): Promise<number> {
  const args = buildPlaywrightArgs(options)
  return runner(options.binPath, args, { cwd: options.projectRoot })
}
