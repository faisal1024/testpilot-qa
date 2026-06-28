import { describe, expect, it } from 'vitest'
import { buildProgram } from '../src/program.js'

describe('CLI program', () => {
  it('registers the MVP commands plus `add`', () => {
    const program = buildProgram()
    const names = program.commands.map((command) => command.name())
    expect(names).toEqual(['init', 'run', 'analyze', 'doctor', 'explain', 'add'])
  })

  it('registers the `add ai` subcommand', () => {
    const add = buildProgram().commands.find((command) => command.name() === 'add')
    expect(add?.commands.map((c) => c.name())).toEqual(['ai'])
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

  it('registers --min-score on the analyze command', () => {
    const analyze = buildProgram().commands.find((command) => command.name() === 'analyze')
    const longs = analyze?.options.map((option) => option.long) ?? []
    expect(longs).toContain('--min-score')
  })
})
