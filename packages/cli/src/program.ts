import { VERSION } from '@testpilot/core'
import { Command } from 'commander'
import { addAiCommand } from './commands/add-ai.js'
import { analyzeCommand } from './commands/analyze.js'
import { doctorCommand } from './commands/doctor.js'
import { explainCommand } from './commands/explain.js'
import { fixCommand } from './commands/fix.js'
import { initCommand } from './commands/init.js'
import { runCommand } from './commands/run.js'

/**
 * Builds the TestPilot CLI program: the five MVP commands — `init` (scaffolding),
 * `run` (Playwright pass-through), `analyze` (static locator analysis), `doctor`
 * (project diagnostics), and `explain` (rule education) — plus `fix` (safe,
 * dry-run-by-default mechanical locator rewrites) and `add ai` (safe,
 * dry-run-by-default AI guidance regeneration).
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
    .option('--reporter <format>', 'Output format: table | json | sarif | html.')
    .option('--output <path>', 'Write the report to a file instead of stdout.')
    .option('--baseline <path>', 'Compare against a baseline; fail only on new findings.')
    .option(
      '--update-baseline',
      'Write the current findings to the --baseline path (records, does not gate).',
    )
    .action(analyzeCommand)

  program
    .command('fix [patterns...]')
    .description('Apply safe, mechanical locator rewrites. Dry-run (diff) by default.')
    .option('--write', 'Write the fixes to disk (default is a dry-run preview).', false)
    .action(fixCommand)

  program
    .command('doctor')
    .description('Diagnose project readiness and common setup issues.')
    .action(doctorCommand)

  program
    .command('explain <ruleId>')
    .description('Explain a rule: why it matters, examples, and guidance.')
    .action(explainCommand)

  const add = program.command('add').description('Add or regenerate project assets.')
  add
    .command('ai [agent]')
    .description('Regenerate AI agent guidance files (dry-run by default). Agent: an id or `all`.')
    .option('--write', 'Apply create/update changes to generated files.', false)
    .option('--force', 'Also overwrite files edited after generation (implies --write).', false)
    .action(addAiCommand)

  return program
}
