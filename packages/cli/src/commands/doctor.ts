import type { Command } from 'commander'
import { readGlobalOptions } from '../util/global-options.js'
import { notImplemented } from '../util/not-implemented.js'
import { resolveConfigOrExit } from '../util/resolve-config.js'

export async function doctorCommand(_options: unknown, command: Command): Promise<never> {
  const globals = readGlobalOptions(command)
  await resolveConfigOrExit(globals)
  notImplemented('doctor', 'Phase 4', globals)
}
