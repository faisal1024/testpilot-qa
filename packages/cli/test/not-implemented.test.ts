import { describe, expect, it } from 'vitest'
import { renderNotImplemented } from '../src/util/not-implemented.js'

describe('renderNotImplemented', () => {
  it('renders a human-readable message', () => {
    expect(renderNotImplemented('analyze', 'Milestone 4', false)).toBe(
      '`testpilot analyze` is not yet implemented — coming in Milestone 4.',
    )
  })

  it('renders a structured JSON payload', () => {
    const payload = JSON.parse(renderNotImplemented('analyze', 'Milestone 4', true))
    expect(payload).toEqual({
      command: 'analyze',
      status: 'not_implemented',
      message: '`testpilot analyze` is not yet implemented.',
      plannedIn: 'Milestone 4',
    })
  })
})
