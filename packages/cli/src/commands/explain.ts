import type { Command } from 'commander'
import { readGlobalOptions } from '../util/global-options.js'
import { notImplemented } from '../util/not-implemented.js'

export function explainCommand(_ruleId: string, _options: unknown, command: Command): never {
  const globals = readGlobalOptions(command)
  // `explain` describes a static rule and does not require project config.
  notImplemented('explain', 'Phase 4', globals)
}
