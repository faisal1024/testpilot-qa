import { resolve } from 'node:path'
import type { Command } from 'commander'

/** Normalized view of the global CLI flags (see docs/CLI-Spec.md §2). */
export interface GlobalOptions {
  json: boolean
  quiet: boolean
  verbose: boolean
  color: boolean
  yes: boolean
  cwd: string
  configPath: string | undefined
}

/** Reads the merged global options for a (sub)command. */
export function readGlobalOptions(command: Command): GlobalOptions {
  const opts = command.optsWithGlobals()
  return {
    json: Boolean(opts.json),
    quiet: Boolean(opts.quiet),
    verbose: Boolean(opts.verbose),
    color: opts.color !== false,
    yes: Boolean(opts.yes),
    // Absolute: `--cwd` reaches the report as `rootDir`, which is documented absolute.
    cwd: resolve(typeof opts.cwd === 'string' ? opts.cwd : process.cwd()),
    configPath: typeof opts.config === 'string' ? opts.config : undefined,
  }
}
