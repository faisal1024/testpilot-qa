import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  AGENT_FILE_PATHS,
  type AgentId,
  type GuidanceAction,
  type GuidanceFileState,
  SUPPORTED_AGENTS,
  actionWrites,
  classifyGuidanceFile,
  generateAgentFiles,
  resolveGuidanceAction,
  selectedAgents,
} from '@testpilot/ai'
import type { Command } from 'commander'
import { ExitCode } from '../util/exit-codes.js'
import { type GlobalOptions, readGlobalOptions } from '../util/global-options.js'
import { OutputError, writeTextFile } from '../util/output.js'
import { resolveConfigOrExit } from '../util/resolve-config.js'

interface AddAiOptions {
  write?: boolean
  force?: boolean
}

interface AddAiFileResult {
  agent: AgentId
  path: string
  state: GuidanceFileState
  action: GuidanceAction
  written: boolean
  reason: string
}

/** True when `agent` is a concrete id the user typed (not `undefined`/`all`). */
function isExplicitAgent(agent: string | undefined): agent is string {
  return agent !== undefined && agent !== 'all'
}

function fail(globals: GlobalOptions, message: string, code: number): never {
  if (!globals.quiet) {
    console.error(message)
  }
  process.exit(code)
}

function readFileOrNull(absolutePath: string): string | null {
  try {
    return readFileSync(absolutePath, 'utf8')
  } catch {
    return null
  }
}

/** Resolves which agents to act on from the optional `[agent]` argument. */
function resolveTargets(
  agent: string | undefined,
  config: { ai: { agents: AgentId[] } },
): AgentId[] {
  if (agent === undefined) return selectedAgents(config.ai.agents)
  if (agent === 'all') return [...SUPPORTED_AGENTS]
  if ((SUPPORTED_AGENTS as readonly string[]).includes(agent)) return [agent as AgentId]
  return []
}

/**
 * `testpilot add ai [agent]` — regenerate AI agent guidance files only.
 *
 * Dry-run by default (shows what would change); `--write` applies create/update
 * actions; `--force` additionally overwrites files edited after generation.
 * Never touches scaffold/test files, never calls an LLM.
 */
export async function addAiCommand(
  agent: string | undefined,
  options: AddAiOptions,
  command: Command,
): Promise<void> {
  const globals = readGlobalOptions(command)
  const { config } = await resolveConfigOrExit(globals)

  // An explicitly-typed agent that isn't supported is a usage error.
  if (isExplicitAgent(agent) && !(SUPPORTED_AGENTS as readonly string[]).includes(agent)) {
    fail(
      globals,
      `Unknown agent "${agent}". Choose one of: ${SUPPORTED_AGENTS.join(', ')}, all.`,
      ExitCode.USAGE,
    )
  }

  const force = options.force === true
  const dryRun = !(options.write === true || force)
  const targets = resolveTargets(agent, config)

  // Only reachable when no agent was named and `config.ai.agents` is empty.
  if (targets.length === 0) {
    reportEmpty(dryRun, globals)
    return
  }

  const generated = new Map(generateAgentFiles(targets).map((file) => [file.path, file.content]))

  const results: AddAiFileResult[] = []
  const writeErrors: string[] = []
  for (const agentId of targets) {
    const path = AGENT_FILE_PATHS[agentId]
    const absolute = resolve(globals.cwd, path)
    const status = classifyGuidanceFile(agentId, readFileOrNull(absolute))
    const action = resolveGuidanceAction(status.state, force)

    let written = false
    let reason = status.reason
    if (!dryRun && actionWrites(action)) {
      const content = generated.get(path) ?? ''
      try {
        writeTextFile(absolute, content)
        written = true
      } catch (error) {
        if (!(error instanceof OutputError)) throw error
        // Don't abort mid-run — record the failure and keep going so the report
        // reflects every file, then exit non-zero below.
        writeErrors.push(error.message)
        reason = error.message
      }
    }
    results.push({ agent: agentId, path, state: status.state, action, written, reason })
  }

  report(results, dryRun, globals)

  if (writeErrors.length > 0) {
    if (!globals.quiet) {
      for (const message of writeErrors) console.error(message)
    }
    process.exit(ExitCode.USAGE)
  }
}

/** Reports the "no agents configured" case (empty `config.ai.agents`). */
function reportEmpty(dryRun: boolean, globals: GlobalOptions): void {
  if (globals.json) {
    console.log(
      JSON.stringify({
        command: 'add',
        resource: 'ai',
        dryRun,
        files: [],
        summary: summarize([], dryRun),
      }),
    )
  } else if (!globals.quiet) {
    console.log('No AI agents configured in config.ai.agents — nothing to regenerate.')
  }
}

const ACTION_LABEL: Record<GuidanceAction, { applied: string; planned: string; symbol: string }> = {
  create: { applied: 'created', planned: 'would create', symbol: '+' },
  update: { applied: 'updated', planned: 'would update', symbol: '~' },
  overwrite: {
    applied: 'overwrote (was edited)',
    planned: 'would overwrite (edited)',
    symbol: '!',
  },
  'skip-current': { applied: 'current', planned: 'current', symbol: '·' },
  'skip-edited': {
    applied: 'edited — kept (use --force to overwrite)',
    planned: 'edited — kept (use --force to overwrite)',
    symbol: '·',
  },
}

function report(results: AddAiFileResult[], dryRun: boolean, globals: GlobalOptions): void {
  const summary = summarize(results, dryRun)
  if (globals.json) {
    console.log(JSON.stringify({ command: 'add', resource: 'ai', dryRun, files: results, summary }))
    return
  }
  if (globals.quiet) {
    return
  }

  for (const file of results) {
    const label = ACTION_LABEL[file.action]
    console.log(`  ${label.symbol} ${file.path} (${dryRun ? label.planned : label.applied})`)
  }

  console.log('')
  if (dryRun) {
    const pending = summary.created + summary.updated
    if (pending > 0) {
      console.log(`${pending} file(s) would change. Re-run with --write to apply.`)
    } else {
      console.log('All guidance files are up to date.')
    }
  } else {
    const changed = summary.created + summary.updated + summary.overwritten
    console.log(`${changed} file(s) written, ${summary.unchanged} already current.`)
    if (summary.failed > 0) {
      console.log(`${summary.failed} file(s) could not be written.`)
    }
  }
  if (summary.skipped > 0) {
    console.log(
      `${summary.skipped} edited file(s) left untouched — re-run with --force to overwrite.`,
    )
  }
}

/**
 * Counts outcomes. On an applied run, a file whose write failed is counted as
 * `failed` (not as its intended create/update/overwrite), so the headline reflects
 * what actually happened on disk rather than what was planned.
 */
function summarize(results: AddAiFileResult[], dryRun: boolean) {
  const summary = { created: 0, updated: 0, overwritten: 0, unchanged: 0, skipped: 0, failed: 0 }
  for (const file of results) {
    if (!dryRun && actionWrites(file.action) && !file.written) {
      summary.failed += 1
    } else if (file.action === 'create') summary.created += 1
    else if (file.action === 'update') summary.updated += 1
    else if (file.action === 'overwrite') summary.overwritten += 1
    else if (file.action === 'skip-current') summary.unchanged += 1
    else summary.skipped += 1
  }
  return summary
}
