import type { Command } from 'commander'
import { readGlobalOptions } from '../util/global-options.js'
import { notImplemented } from '../util/not-implemented.js'

export function initCommand(_options: unknown, command: Command): never {
  const globals = readGlobalOptions(command)
  // `init` creates a new project, so it does not load an existing config.
  notImplemented('init', 'Milestone 3', globals)
}
