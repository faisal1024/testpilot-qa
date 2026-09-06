import { describe, expect, it } from 'vitest'
import { AGENT_FILE_PATHS, SUPPORTED_AGENTS, generateAgentFiles } from '../src/generators.js'
import { GUIDANCE_VERSION, isGuidancePristine, parseGuidanceMarker } from '../src/marker.js'

describe('generateAgentFiles', () => {
  it('emits one file per supported agent, at the expected paths, in canonical order', () => {
    const files = generateAgentFiles()
    expect(files.map((f) => f.path)).toEqual([
      'CLAUDE.md',
      'AGENTS.md',
      '.cursor/rules/testpilot-playwright.mdc',
      '.github/copilot-instructions.md',
    ])
  })

  it('marks every file as generated and pristine, with per-file content hashes', () => {
    const files = generateAgentFiles()
    const hashes = new Set<string>()
    for (const file of files) {
      const marker = parseGuidanceMarker(file.content)
      expect(marker, file.path).not.toBeNull()
      expect(marker?.version).toBe(GUIDANCE_VERSION)
      expect(isGuidancePristine(file.content), file.path).toBe(true)
      hashes.add(marker?.hash ?? '')
    }
    // Different agents → different bodies → different hashes.
    expect(hashes.size).toBe(files.length)
  })

  it('is deterministic', () => {
    expect(JSON.stringify(generateAgentFiles())).toBe(JSON.stringify(generateAgentFiles()))
  })

  it('keeps the Cursor frontmatter at the very top (before the marker)', () => {
    const cursor = generateAgentFiles(['cursor'])[0]
    expect(cursor?.path).toBe(AGENT_FILE_PATHS.cursor)
    expect(cursor?.content.startsWith('---\n')).toBe(true)
  })

  it('derives every file from the canonical guidance', () => {
    for (const file of generateAgentFiles()) {
      expect(file.content).toContain('Locator hierarchy')
      expect(file.content).toContain('does **not** inspect the DOM')
    }
  })

  it('generates only the requested agents', () => {
    const files = generateAgentFiles(['claude', 'copilot'])
    expect(files.map((f) => f.path)).toEqual(['CLAUDE.md', '.github/copilot-instructions.md'])
  })

  it('exposes a stable supported-agent list', () => {
    expect([...SUPPORTED_AGENTS]).toEqual(['claude', 'codex', 'cursor', 'copilot'])
  })
})
