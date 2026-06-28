import { existsSync, readFileSync } from 'node:fs'
import type { Baseline } from '@testpilot/core'
import { writeJsonFile } from './output.js'

/** Raised when a baseline file is missing, unreadable, or malformed. */
export class BaselineError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'BaselineError'
  }
}

/** Loads and minimally validates a baseline file. Throws {@link BaselineError} on any problem. */
export function loadBaseline(absolutePath: string, displayPath: string): Baseline {
  if (!existsSync(absolutePath)) {
    throw new BaselineError(
      `Baseline file not found: ${displayPath}\n` +
        `Create it first: testpilot analyze --baseline ${displayPath} --update-baseline`,
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(absolutePath, 'utf8'))
  } catch (error) {
    throw new BaselineError(
      `Could not parse baseline file ${displayPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { entries?: unknown }).entries)
  ) {
    throw new BaselineError(`Invalid baseline file ${displayPath}: missing an "entries" array.`)
  }
  return parsed as Baseline
}

/** Writes a baseline to disk (pretty JSON). Throws {@link import('./output.js').OutputError} on failure. */
export function writeBaseline(absolutePath: string, baseline: Baseline): void {
  writeJsonFile(absolutePath, baseline)
}
