import type { LocatorApi } from '../locator-context.js'
import { attributeTokens, hasPseudo } from '../selector/query.js'
import { DEFAULT_TEST_ID_ATTRIBUTES } from './prefer-get-by-test-id.js'
import type { Rule } from './types.js'

/** `getBy*` methods — a parent locator that is already user-facing. */
const USER_FACING_APIS: ReadonlySet<LocatorApi> = new Set<LocatorApi>([
  'getByRole',
  'getByText',
  'getByLabel',
  'getByPlaceholder',
  'getByAltText',
  'getByTitle',
  'getByTestId',
])

/**
 * Pseudo-classes that make a selector a *scope refined by content* rather than
 * a handle in its own right — the selector-syntax spelling of the `has` /
 * `hasText` options. Abstaining on one and not the other would give two
 * different answers for the same Playwright feature written two ways.
 */
const COMPOSITION_PSEUDOS: ReadonlySet<string> = new Set(['has', 'has-text'])

/**
 * Flags a raw `locator()` selector with no semantic handle — a bare tag, class,
 * `#id`, or `text=` string that says nothing about what the element *is* to a
 * user.
 *
 * This is what remains of `prefer-user-facing-locator` after Phase 11b took the
 * mechanically fixable case out to `prefer-get-by-test-id`. It ships at `info`
 * rather than `warn` on purpose: it is category-level advice with no concrete
 * replacement (Tier 1 has no DOM), so it belongs among the nudges, not among
 * the findings a gate should fail on.
 *
 * It stays quiet whenever the call already shows evidence of a user-facing
 * intent — an ARIA attribute, a role, composition with `has`/`hasText`, or a
 * `getBy*()` parent it is merely narrowing. Every one of those was a false
 * positive in the corpus.
 */
export const preferSemanticLocator: Rule = {
  id: 'prefer-semantic-locator',
  category: 'locator',
  defaultSeverity: 'info',
  docsUrl:
    'https://github.com/faisal1024/testpilot-qa/blob/main/docs/rules/prefer-semantic-locator.md',
  evaluate(context) {
    if (context.isDynamic || context.apiCall !== 'locator' || !context.parsed) {
      return null
    }
    if (context.selectorEngine !== 'css' && context.selectorEngine !== 'text') {
      return null
    }
    // Narrowing a user-facing parent: `getByRole('row').locator('td')` is the
    // documented way to scope, and the parent already carries the semantics.
    if (context.parentApi !== undefined && USER_FACING_APIS.has(context.parentApi)) {
      return null
    }
    // `locator('.row', { hasText: 'Save' })` — the selector is a scope and the
    // content match is the handle.
    if (context.options !== undefined) {
      return null
    }
    const composed = hasPseudo(context.parsed, COMPOSITION_PSEUDOS)
    if (composed === null || composed) {
      return null
    }
    const attributes = attributeTokens(context.parsed)
    if (attributes === null) {
      return null
    }
    // A test id is a handle, just not a semantic one — `prefer-get-by-test-id`
    // owns that case and has an exact replacement to offer. Reporting both on
    // one call site would be two lines for one decision.
    if (attributes.some((attribute) => DEFAULT_TEST_ID_ATTRIBUTES.includes(attribute.name))) {
      return null
    }
    if (attributes.some(isSemantic)) {
      return null
    }
    // `role=button[name="Save"]` through the `role=` engine is already the
    // thing this rule asks for, spelled as a selector.
    if (context.parsed.parts.some((part) => part.engine === 'role')) {
      return null
    }
    return {
      message:
        'This locator() selector has no semantic handle — no role, label, or ARIA attribute.',
      suggestion:
        'Prefer getByRole(), getByLabel(), getByPlaceholder() or getByText(); add a data-testid and use getByTestId() when there is no semantic handle to use.',
    }
  },
}

/** `[role=…]` or any `[aria-*]` — evidence the selector targets what a user perceives. */
function isSemantic(attribute: { name: string }): boolean {
  return attribute.name === 'role' || attribute.name.startsWith('aria-')
}
