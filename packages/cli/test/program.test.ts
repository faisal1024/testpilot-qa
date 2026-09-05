import { describe, expect, it } from 'vitest'
import { buildProgram } from '../src/program.js'
import { CLI_VERSION } from '../src/version.js'

describe('CLI program', () => {
  it('registers the MVP commands plus `fix` and `add`', () => {
    const program = buildProgram()
    const names = program.commands.map((command) => command.name())
    expect(names).toEqual(['init', 'run', 'analyze', 'fix', 'doctor', 'explain', 'add'])
  })

  it('registers the `add ai` subcommand', () => {
    const add = buildProgram().commands.find((command) => command.name() === 'add')
    expect(add?.commands.map((c) => c.name())).toEqual(['ai'])
  })

  it('exposes its package version (read from package.json, not hardcoded)', () => {
    const program = buildProgram()
    expect(program.version()).toBe(CLI_VERSION)
    expect(program.version()).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/) // valid semver
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
