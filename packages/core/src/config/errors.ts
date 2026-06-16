/**
 * Raised when a config file is missing (when explicitly requested), fails to
 * load, or fails schema validation. The CLI maps this to exit code 3.
 */
export class ConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ConfigError'
  }
}
