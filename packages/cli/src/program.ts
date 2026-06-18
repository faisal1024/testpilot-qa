import { VERSION } from '@testpilot/core'
import { Command } from 'commander'
import { analyzeCommand } from './commands/analyze.js'
import { doctorCommand } from './commands/doctor.js'
import { explainCommand } from './commands/explain.js'
import { initCommand } from './commands/init.js'
import { runCommand } from './commands/run.js'

/**
 * Builds the TestPilot CLI program. `init` (scaffolding), `run` (Playwright
 * pass-through), and `analyze` (static locator analysis, Milestone 3A) are
 * implemented; `doctor` and `explain` remain placeholders until their phases.
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
    .command('init [directory]')
    .description('Scaffold a Playwright project.')
    .option('--template <id>', 'Template to use.', 'ui-api-fullstack')
    .option('--force', 'Overwrite existing files.', false)
    .action(initCommand)

  program
    .command('run')
    .description('Run Playwright tests — a thin pass-through. Forward args after `--`.')
    .allowUnknownOption()
    .allowExcessArguments()
    .action(runCommand)

  program
    .command('analyze [patterns...]')
    .description('Analyze locator quality in test files.')
    .option('--min-score <number>', 'Fail (non-zero exit) if the score is below this value.', (v) =>
      Number(v),
    )
    .action(analyzeCommand)

  program.command('doctor').description('Diagnose the project (Phase 4).').action(doctorCommand)

  program
    .command('explain <ruleId>')
    .description('Explain a locator rule (Phase 4).')
    .action(explainCommand)

  return program
}
