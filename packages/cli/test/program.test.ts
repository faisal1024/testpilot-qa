import { describe, expect, it } from 'vitest'
import { buildProgram } from '../src/program.js'

describe('CLI program', () => {
  it('registers the four MVP commands', () => {
    const program = buildProgram()
    const names = program.commands.map((command) => command.name())
    expect(names).toEqual(['init', 'analyze', 'doctor', 'explain'])
  })

  it('exposes a version', () => {
    const program = buildProgram()
    expect(program.version()).toBe('0.0.0')
  })

  it('describes the tool', () => {
    const program = buildProgram()
    expect(program.description()).toContain('Playwright')
  })

  it('registers the global options', () => {
    const program = buildProgram()
    const longs = program.options.map((option) => option.long)
    expect(longs).toEqual(
      expect.arrayContaining([
        '--json',
        '--config',
        '--cwd',
        '--yes',
        '--quiet',
        '--verbose',
        '--no-color',
      ]),
    )
  })
})
