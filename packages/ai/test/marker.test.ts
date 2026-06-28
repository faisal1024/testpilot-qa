import { describe, expect, it } from 'vitest'
import { generateAgentFiles } from '../src/generators.js'
import {
  extractGeneratedBody,
  hashGuidance,
  isGuidancePristine,
  parseGuidanceMarker,
} from '../src/marker.js'

describe('guidance markers', () => {
  it('hashes deterministically', () => {
    expect(hashGuidance('abc')).toBe(hashGuidance('abc'))
    expect(hashGuidance('abc')).not.toBe(hashGuidance('abd'))
  })

  it('round-trips: a generated file is pristine; an edited one is not', () => {
    const file = generateAgentFiles(['claude'])[0]
    const content = file?.content ?? ''
    expect(isGuidancePristine(content)).toBe(true)

    const edited = `${content}\nhand-edited line\n`
    expect(isGuidancePristine(edited)).toBe(false)
  })

  it('extracts the body the hash covers', () => {
    const file = generateAgentFiles(['claude'])[0]
    const content = file?.content ?? ''
    const marker = parseGuidanceMarker(content)
    expect(hashGuidance(extractGeneratedBody(content))).toBe(marker?.hash)
  })

  it('returns null for content without a marker', () => {
    expect(parseGuidanceMarker('just some text')).toBeNull()
    expect(isGuidancePristine('just some text')).toBe(false)
  })
})
