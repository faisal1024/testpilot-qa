/** Raised when scaffolding cannot proceed (unknown template, unsafe path, …). */
export class ScaffoldError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ScaffoldError'
  }
}
