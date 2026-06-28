import { CANONICAL_GUIDANCE } from './guidance.js'
import { guidanceMarker, hashGuidance } from './marker.js'

/** Supported AI agents (canonical order — drives generated-file ordering). */
export const SUPPORTED_AGENTS = ['claude', 'codex', 'cursor', 'copilot'] as const
export type AgentId = (typeof SUPPORTED_AGENTS)[number]

/** Path each agent's guidance file is written to, relative to the project root. */
export const AGENT_FILE_PATHS: Record<AgentId, string> = {
  claude: 'CLAUDE.md',
  codex: 'AGENTS.md',
  cursor: '.cursor/rules/testpilot-playwright.mdc',
  copilot: '.github/copilot-instructions.md',
}

export interface GeneratedFile {
  path: string
  content: string
}

/** Builds a Markdown file: marker on line 1, then the body (which the hash covers). */
function markdownFile(path: string, body: string): GeneratedFile {
  return { path, content: `${guidanceMarker(hashGuidance(body))}\n${body}` }
}

/** Builds an MDC file: YAML frontmatter, then the marker, then the body. */
function mdcFile(path: string, frontmatter: string, body: string): GeneratedFile {
  const hashed = `${frontmatter}${body}`
  return { path, content: `${frontmatter}${guidanceMarker(hashGuidance(hashed))}\n${body}` }
}

function claudeFile(): GeneratedFile {
  const body = [
    '# CLAUDE.md',
    '',
    'This project uses **TestPilot QA** on top of Playwright. Follow this guidance when writing or',
    'changing tests.',
    '',
    CANONICAL_GUIDANCE,
    '',
    '## Before you finish',
    '',
    '- Run `npx testpilot-qa analyze` and resolve fragile-locator findings.',
    '- Run `npx testpilot-qa doctor` if the project setup looks off.',
    '',
  ].join('\n')
  return markdownFile(AGENT_FILE_PATHS.claude, body)
}

function agentsFile(): GeneratedFile {
  const body = [
    '# AGENTS.md',
    '',
    'Guidance for AI agents working in this Playwright project (scaffolded by TestPilot QA). This is',
    'the canonical, tool-neutral guidance; other agent files are generated from the same source.',
    '',
    CANONICAL_GUIDANCE,
    '',
  ].join('\n')
  return markdownFile(AGENT_FILE_PATHS.codex, body)
}

function copilotFile(): GeneratedFile {
  const body = [
    '# GitHub Copilot instructions',
    '',
    'When suggesting Playwright test code in this repository, follow these conventions.',
    '',
    CANONICAL_GUIDANCE,
    '',
  ].join('\n')
  return markdownFile(AGENT_FILE_PATHS.copilot, body)
}

function cursorFile(): GeneratedFile {
  const frontmatter = [
    '---',
    'description: TestPilot QA + Playwright conventions for writing resilient tests',
    'globs:',
    '  - "tests/**/*.spec.ts"',
    '  - "tests/**/*.test.ts"',
    'alwaysApply: false',
    '---',
    '',
  ].join('\n')
  const body = ['# TestPilot QA — Playwright rules', '', CANONICAL_GUIDANCE, ''].join('\n')
  return mdcFile(AGENT_FILE_PATHS.cursor, frontmatter, body)
}

const BUILDERS: Record<AgentId, () => GeneratedFile> = {
  claude: claudeFile,
  codex: agentsFile,
  cursor: cursorFile,
  copilot: copilotFile,
}

/**
 * Generates the guidance files for the requested agents (default: all supported),
 * in canonical order. Deterministic — same input, identical output.
 */
export function generateAgentFiles(agents: readonly AgentId[] = SUPPORTED_AGENTS): GeneratedFile[] {
  const requested = new Set(agents)
  return SUPPORTED_AGENTS.filter((agent) => requested.has(agent)).map((agent) => BUILDERS[agent]())
}
