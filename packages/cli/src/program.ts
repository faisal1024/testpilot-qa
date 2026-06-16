import { VERSION } from '@testpilot/core'
import { Command } from 'commander'
import { analyzeCommand } from './commands/analyze.js'
import { doctorCommand } from './commands/doctor.js'
import { explainCommand } from './commands/explain.js'
import { initCommand } from './commands/init.js'

/**
 * Builds the TestPilot CLI program. Milestone 2 adds the global option surface
 * and config loading; command handlers remain placeholders until their phases.
 */
export function buildProgram(): Command {
  const program = new Command('testpilot')
    .description('A developer-experience layer and project accelerator for Playwright.')
    .version(VERSION, '-v, --version')
    .option('--json', 'Output machine-readable JSON.', false)
    .option('--config <path>', 'Path to testpilot.config.ts.')
    .option('--cwd <path>', 'Run as if in this directory.')
    .option('-y, --yes', 'Skip confirmation prompts.', false)
    .option('-q, --quiet', 'Only print errors.', false)
    .option('--verbose', 'Enable verbose logging.', false)
    .option('--no-color', 'Disable colored output.')

  program
    .command('init')
    .description('Scaffold a Playwright project (Milestone 3).')
    .action(initCommand)

  program
    .command('analyze')
    .description('Analyze locator quality (Milestone 4).')
    .action(analyzeCommand)

  program.command('doctor').description('Diagnose the project (Phase 4).').action(doctorCommand)

  program
    .command('explain <ruleId>')
    .description('Explain a locator rule (Phase 4).')
    .action(explainCommand)

  return program
}
