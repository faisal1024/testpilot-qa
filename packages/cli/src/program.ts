import { Command } from 'commander'
import { addAiCommand } from './commands/add-ai.js'
import { analyzeCommand } from './commands/analyze.js'
import { doctorCommand } from './commands/doctor.js'
import { explainCommand } from './commands/explain.js'
import { fixCommand } from './commands/fix.js'
import { initCommand } from './commands/init.js'
import { runCommand } from './commands/run.js'
import { tagsCommand } from './commands/tags.js'
import { CLI_VERSION } from './version.js'

/**
 * Builds the TestPilot CLI program: the five MVP commands — `init` (scaffolding),
 * `run` (Playwright pass-through, with tag/suite selection), `analyze` (static
 * locator analysis), `tags` (tag vocabulary), `doctor`
 * (project diagnostics), and `explain` (rule education) — plus `fix` (safe,
 * dry-run-by-default mechanical locator rewrites) and `add ai` (safe,
 * dry-run-by-default AI guidance regeneration).
 */
/** Commander shows a subcommand's own options only; these live on the program. */
const GLOBAL_FLAGS_HELP = `
Global flags (usable on any command):
  --json                     Output machine-readable JSON.
  --config <path>            Path to testpilot.config.ts.
  --cwd <path>               Run as if in this directory.
  -y, --yes                  Skip confirmation prompts.
  -q, --quiet                Only print errors.
  --verbose                  Explain what was discovered and why.
  --no-color                 Disable ANSI color.
  --no-playwright-discovery  Ignore playwright.config.* when discovering tests.`

export function buildProgram(): Command {
  const program = new Command('testpilot')
    .description('A developer-experience layer and project accelerator for Playwright.')
    .version(CLI_VERSION, '-v, --version')
    .option('--json', 'Output machine-readable JSON.', false)
    .option('--config <path>', 'Path to testpilot.config.ts.')
    .option('--cwd <path>', 'Run as if in this directory.')
    .option('-y, --yes', 'Skip confirmation prompts.', false)
    .option('-q, --quiet', 'Only print errors.', false)
    .option('--verbose', 'Enable verbose logging.', false)
    .option('--no-color', 'Disable colored output.')
    .option(
      '--no-playwright-discovery',
      'Do not read testDir/testMatch from playwright.config.* when testpilot.config.ts omits them.',
    )

  program
    .command('init [directory]')
    .description('Scaffold a Playwright project.')
    .option('--template <id>', 'Template to use.', 'ui-api-fullstack')
    .option('--force', 'Overwrite existing files.', false)
    .action(initCommand)

  const collect = (value: string, previous: string[]): string[] => [...previous, value]

  program
    .command('run')
    .description('Run Playwright tests — a thin pass-through. Forward args after `--`.')
    .option(
      '--tag <tags>',
      'Run tests with these tags (comma-separated, any-of). Prefix with ! to exclude.',
      collect,
      [],
    )
    .option('--exclude-tag <tags>', 'Skip tests with these tags (comma-separated).', collect, [])
    .option('--suite <name>', 'Run a named tag set from testpilot.config.ts `suites`.', collect, [])
    .allowUnknownOption()
    .allowExcessArguments()
    .addHelpText('after', GLOBAL_FLAGS_HELP)
    .action(runCommand)

  program
    .command('tags [patterns...]')
    .description('List the tag vocabulary of the suite, with per-tag test counts.')
    .option('--output <path>', 'Write the report to a file instead of stdout.')
    .addHelpText('after', GLOBAL_FLAGS_HELP)
    .action(tagsCommand)

  program
    .command('analyze [patterns...]')
    .description('Analyze locator quality in test files.')
    .option('--min-score <number>', 'Fail (non-zero exit) if the score is below this value.', (v) =>
      Number(v),
    )
    .option('--reporter <format>', 'Output format: table | json | sarif | html.')
    .option('--output <path>', 'Write the report to a file instead of stdout.')
    .option(
      '--with-helpers',
      'Also analyze page objects, fixtures and helpers (files Playwright does not run).',
    )
    .option('--baseline <path>', 'Compare against a baseline; fail only on new findings.')
    .option(
      '--update-baseline',
      'Write the current findings to the --baseline path (records, does not gate).',
    )
    .addHelpText('after', GLOBAL_FLAGS_HELP)
    .action(analyzeCommand)

  program
    .command('fix [patterns...]')
    .description('Apply safe, mechanical locator rewrites. Dry-run (diff) by default.')
    .option('--write', 'Write the fixes to disk (default is a dry-run preview).', false)
    .option(
      '--with-helpers',
      'Also fix page objects, fixtures and helpers (files Playwright does not run).',
    )
    .addHelpText('after', GLOBAL_FLAGS_HELP)
    .action(fixCommand)

  program
    .command('doctor')
    .description('Diagnose project readiness and common setup issues.')
    .option(
      '--strict-guidance',
      'Also check AI guidance files on a project with no testpilot.config.ts.',
    )
    .addHelpText('after', GLOBAL_FLAGS_HELP)
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
