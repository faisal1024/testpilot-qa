/**
 * @testpilot/scaffold — the `init` workflow and file generation.
 *
 * Templates are data (see @testpilot/templates); this package turns a template
 * into files on disk, safely.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'
import { type AgentId, SUPPORTED_AGENTS, generateAgentFiles } from '@testpilot/ai'
import { DEFAULT_TEMPLATE_ID, getTemplate } from '@testpilot/templates'
import { ScaffoldError } from './errors.js'

export { ScaffoldError } from './errors.js'

export interface ScaffoldOptions {
  /** Directory to scaffold into (created if missing). */
  targetDir: string
  /** Template id. Defaults to `ui-api-fullstack`. */
  templateId?: string
  /** Project name. Defaults to the target directory's basename. */
  projectName?: string
  /** Overwrite existing files. Defaults to `false` (existing files are skipped). */
  force?: boolean
  /** AI agents whose guidance files to generate. Defaults to all supported agents. */
  agents?: readonly AgentId[]
}

export interface ScaffoldResult {
  targetDir: string
  projectName: string
  templateId: string
  /** Paths (relative to targetDir) that were written. */
  created: string[]
  /** Paths that already existed and were left untouched (no `force`). */
  skipped: string[]
}

/**
 * Generates a project from a template. Never overwrites existing files unless
 * `force` is set, and never writes outside `targetDir`.
 */
export function scaffoldProject(options: ScaffoldOptions): ScaffoldResult {
  const targetDir = resolve(options.targetDir)
  const templateId = options.templateId ?? DEFAULT_TEMPLATE_ID
  const template = getTemplate(templateId)
  if (!template) {
    throw new ScaffoldError(`Unknown template: ${templateId}`)
  }

  const projectName = options.projectName ?? basename(targetDir)
  // The template provides the project; @testpilot/ai appends agent guidance files.
  // Both are { path, content } and flow through the same overwrite-protection loop.
  const files = [
    ...template.files({ projectName }),
    ...generateAgentFiles(options.agents ?? SUPPORTED_AGENTS),
  ]

  const created: string[] = []
  const skipped: string[] = []

  for (const file of files) {
    const dest = resolve(targetDir, file.path)
    const rel = relative(targetDir, dest)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new ScaffoldError(`Template path escapes the target directory: ${file.path}`)
    }

    if (existsSync(dest) && !options.force) {
      skipped.push(file.path)
      continue
    }

    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, file.content)
    created.push(file.path)
  }

  return { targetDir, projectName, templateId, created, skipped }
}
