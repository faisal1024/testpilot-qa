import { readFileSync } from 'node:fs'

/**
 * The published CLI version — the single source of truth for `--version`, the
 * SARIF `tool.version`, and the HTML report footer.
 *
 * Read from this package's own `package.json` so it always matches what was
 * published; the release flow (Changesets) bumps `package.json` and the version
 * follows automatically — never hand-edit a version constant. This module sits
 * one directory below `package.json` in both `src/` (tests) and the bundled
 * `dist/` (and in an installed `node_modules/testpilot-qa/`), so the relative
 * resolution works everywhere.
 */
export const CLI_VERSION: string = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version
