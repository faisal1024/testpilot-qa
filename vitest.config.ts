import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@testpilot/ai': pkg('ai'),
      '@testpilot/core': pkg('core'),
      '@testpilot/locator-intelligence': pkg('locator-intelligence'),
      '@testpilot/scaffold': pkg('scaffold'),
      '@testpilot/templates': pkg('templates'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'scripts/**/*.test.mjs'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
    },
  },
})
