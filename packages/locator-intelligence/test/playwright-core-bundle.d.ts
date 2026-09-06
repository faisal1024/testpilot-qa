/**
 * Playwright's internal bundle has no type declarations. It is used only as an
 * oracle in `tokenize-differential.test.ts`, from a devDependency that never
 * reaches the published CLI.
 */
declare module 'playwright-core/lib/coreBundle' {
  export const iso: { parseSelector(selector: string): unknown }
}
