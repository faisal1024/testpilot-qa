import { existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const PLAYWRIGHT_CONFIG_BASENAMES = [
  'playwright.config.ts',
  'playwright.config.mts',
  'playwright.config.cts',
  'playwright.config.js',
  'playwright.config.mjs',
  'playwright.config.cjs',
]

/** Walks up from `cwd` looking for the first directory that contains any of `filenames`. */
export function findUp(cwd: string, filenames: string[]): string | null {
  let dir = resolve(cwd)
  for (;;) {
    for (const name of filenames) {
      if (existsSync(join(dir, name))) {
        return join(dir, name)
      }
    }
    const parent = dirname(dir)
    if (parent === dir) {
      return null
    }
    dir = parent
  }
}

/** Finds the nearest project root (closest ancestor with a `package.json`). Falls back to `cwd`. */
export function findProjectRoot(cwd: string): string {
  const pkg = findUp(cwd, ['package.json'])
  return pkg ? dirname(pkg) : resolve(cwd)
}

/**
 * Resolves the Playwright config path.
 * - When `hint` is given and exists (relative to `root`), that path is used.
 * - Otherwise the standard basenames are probed in `root`.
 * Returns `null` when none is found (Playwright will fall back to its own discovery).
 */
export function findPlaywrightConfig(root: string, hint?: string): string | null {
  if (hint) {
    const hinted = resolve(root, hint)
    if (existsSync(hinted)) {
      return hinted
    }
  }
  for (const name of PLAYWRIGHT_CONFIG_BASENAMES) {
    const candidate = join(root, name)
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

/** Resolves the locally-installed Playwright CLI binary, or `null` if not installed. */
export function resolvePlaywrightBin(root: string): string | null {
  const binName = process.platform === 'win32' ? 'playwright.cmd' : 'playwright'
  const candidate = join(root, 'node_modules', '.bin', binName)
  if (existsSync(candidate)) {
    return candidate
  }
  return null
}

/** True when `dir` exists and is a directory. */
export function isDirectory(dir: string): boolean {
  return existsSync(dir) && statSync(dir).isDirectory()
}
