import { describe, expect, it } from 'vitest'
import { classifyGuidanceFile, selectedAgents } from '../src/drift.js'
import { generateAgentFiles } from '../src/generators.js'

const claudeContent = generateAgentFiles(['claude'])[0]?.content ?? ''

describe('classifyGuidanceFile', () => {
  it('reports a freshly generated file as current', () => {
    const status = classifyGuidanceFile('claude', claudeContent)
    expect(status.state).toBe('current')
    expect(status.path).toBe('CLAUDE.md')
    expect(status.markerVersion).toBe(1)
    expect(status.expectedVersion).toBe(1)
  })

  it('reports a missing file', () => {
    const status = classifyGuidanceFile('claude', null)
    expect(status.state).toBe('missing')
    expect(status.markerVersion).toBeNull()
  })

  it('reports a file with no marker', () => {
    const status = classifyGuidanceFile('claude', '# my notes\n')
    expect(status.state).toBe('no-marker')
  })

  it('reports an edited file', () => {
    const status = classifyGuidanceFile('claude', `${claudeContent}\nhand edit\n`)
    expect(status.state).toBe('edited')
    expect(status.markerVersion).toBe(1)
  })

  it('reports a stale marker version', () => {
    const stale = claudeContent.replace(' v1 ', ' v0 ')
    const status = classifyGuidanceFile('claude', stale)
    expect(status.state).toBe('stale')
    expect(status.markerVersion).toBe(0)
    expect(status.reason).toContain('v0')
  })
})

describe('selectedAgents', () => {
  it('defaults to all supported agents in canonical order', () => {
    expect(selectedAgents()).toEqual(['claude', 'codex', 'cursor', 'copilot'])
  })

  it('filters to the requested agents, preserving canonical order', () => {
    expect(selectedAgents(['copilot', 'claude'])).toEqual(['claude', 'copilot'])
  })
})
