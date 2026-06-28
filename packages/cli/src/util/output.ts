import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** Raised when a file cannot be written (e.g. an unwritable `--output` path). */
export class OutputError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'OutputError'
  }
}

/** Writes pretty-printed JSON to an absolute path, creating parent dirs. */
export function writeJsonFile(absolutePath: string, data: unknown): void {
  writeTextFile(absolutePath, `${JSON.stringify(data, null, 2)}\n`)
}

/** Writes text to an absolute path, creating parent dirs. */
export function writeTextFile(absolutePath: string, content: string): void {
  try {
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, content)
  } catch (error) {
    throw new OutputError(
      `Could not write to ${absolutePath}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}
