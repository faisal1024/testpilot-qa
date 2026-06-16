/**
 * @testpilot/templates — built-in project templates (data-only).
 *
 * Milestone 2.5 ships a single template: `ui-api-fullstack`.
 */
import type { Template } from './types.js'
import { uiApiFullstack } from './ui-api-fullstack.js'

export type { Template, TemplateContext, TemplateFile } from './types.js'
export { uiApiFullstack } from './ui-api-fullstack.js'

/** The default (and currently only) built-in template id. */
export const DEFAULT_TEMPLATE_ID = 'ui-api-fullstack'

/** Registry of built-in templates keyed by id. */
export const templates: Record<string, Template> = {
  [uiApiFullstack.id]: uiApiFullstack,
}

/** Returns a template by id, or `undefined` when unknown. */
export function getTemplate(id: string): Template | undefined {
  return templates[id]
}

/** All available template ids. */
export function templateIds(): string[] {
  return Object.keys(templates)
}
