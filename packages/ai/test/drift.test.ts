import { describe, expect, it } from 'vitest'
import {
  type GuidanceFileState,
  actionWrites,
  classifyGuidanceFile,
  resolveGuidanceAction,
  selectedAgents,
} from '../src/drift.js'
import { generateAgentFiles } from '../src/generators.js'
import { GUIDANCE_VERSION } from '../src/marker.js'

const claudeContent = generateAgentFiles(['claude'])[0]?.content ?? ''

describe('classifyGuidanceFile', () => {
  it('reports a freshly generated file as current', () => {
    const status = classifyGuidanceFile('claude', claudeContent)
    expect(status.state).toBe('current')
    expect(status.path).toBe('CLAUDE.md')
    expect(status.markerVersion).toBe(GUIDANCE_VERSION)
    expect(status.expectedVersion).toBe(GUIDANCE_VERSION)
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
    expect(status.markerVersion).toBe(GUIDANCE_VERSION)
  })

  it('reports a stale marker version', () => {
    const stale = claudeContent.replace(` v${GUIDANCE_VERSION} `, ' v0 ')
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

describe('resolveGuidanceAction', () => {
  it('creates missing, updates stale, leaves current alone', () => {
    expect(resolveGuidanceAction('missing', false)).toBe('create')
    expect(resolveGuidanceAction('stale', false)).toBe('update')
    expect(resolveGuidanceAction('current', false)).toBe('skip-current')
  })

  it('never overwrites edited or unmarked files without force', () => {
    expect(resolveGuidanceAction('edited', false)).toBe('skip-edited')
    expect(resolveGuidanceAction('no-marker', false)).toBe('skip-edited')
    expect(resolveGuidanceAction('edited', true)).toBe('overwrite')
    expect(resolveGuidanceAction('no-marker', true)).toBe('overwrite')
  })

  it('force does not change create/update/current outcomes', () => {
    expect(resolveGuidanceAction('missing', true)).toBe('create')
    expect(resolveGuidanceAction('stale', true)).toBe('update')
    expect(resolveGuidanceAction('current', true)).toBe('skip-current')
  })

  it('actionWrites is true only for create/update/overwrite', () => {
    const writes: GuidanceFileState[] = ['missing', 'stale', 'edited']
    for (const state of writes) {
      expect(actionWrites(resolveGuidanceAction(state, true))).toBe(true)
    }
    expect(actionWrites('skip-current')).toBe(false)
    expect(actionWrites('skip-edited')).toBe(false)
  })
})
