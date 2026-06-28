import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  // Bundle the internal @testpilot/* workspace packages into the published CLI so
  // `testpilot-qa` is a single self-contained package (no unpublished workspace
  // deps to resolve on install). Real npm deps (commander, zod, jiti, …) stay
  // external and are declared in package.json dependencies.
  noExternal: [/^@testpilot\//],
})
