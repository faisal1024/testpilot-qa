import type { GlobalOptions } from './global-options.js'

/** Prints `message` to stderr (unless `--quiet`) and exits with `code`. */
export function fail(globals: GlobalOptions, message: string, code: number): never {
  if (!globals.quiet) {
    console.error(message)
  }
  process.exit(code)
}
