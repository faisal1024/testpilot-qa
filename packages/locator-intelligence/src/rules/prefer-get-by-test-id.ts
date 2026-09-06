import { attributeTokens, targetCompound } from '../selector/query.js'
import type { Rule, RuleOptions } from './types.js'

/**
 * Attributes treated as test ids by default.
 *
 * Playwright's own `testIdAttribute` defaults to `data-testid`; the other two
 * are the spellings its docs name for teams that already had a convention.
 * Anything else has to be configured, because "looks like a test id to me" is
 * how a rule starts flagging a product attribute as a test hook.
 */
export const DEFAULT_TEST_ID_ATTRIBUTES: readonly string[] = [
  'data-testid',
  'data-test-id',
  'data-test',
]

function configuredAttributes(options: RuleOptions | undefined): readonly string[] {
  const configured = options?.testIdAttributes
  return configured && configured.length > 0 ? configured : DEFAULT_TEST_ID_ATTRIBUTES
}

/**
 * Flags `locator('[data-testid="x"]')` — a test id addressed through a raw CSS
 * attribute selector, when `getByTestId('x')` says the same thing.
 *
 * Split out of `prefer-user-facing-locator` in Phase 11b because it is the one
 * case with a concrete, mechanical answer: the rule can print the exact
 * replacement instead of the category-level "prefer user-facing locators" that
 * made the old rule 65% of every finding the tool reported.
 *
 * The message distinguishes two shapes, because they do not have the same fix:
 * a selector whose *target* carries the test id converts directly, while
 * `[data-testid=list] > li a` targets the anchor and needs the test id to
 * become a scope (`getByTestId('list').locator('li a')`).
 */
export const preferGetByTestId: Rule = {
  id: 'prefer-get-by-test-id',
  category: 'locator',
  defaultSeverity: 'warn',
  docsUrl:
    'https://github.com/faisal1024/testpilot-qa/blob/main/docs/rules/prefer-get-by-test-id.md',
  evaluate(context, options) {
    if (context.isDynamic || context.apiCall !== 'locator' || !context.parsed) {
      return null
    }
    const attributes = attributeTokens(context.parsed)
    if (attributes === null) {
      return null
    }
    const names = configuredAttributes(options)
    const match = attributes.find((attribute) => names.includes(attribute.name))
    if (!match) {
      return null
    }
    // The value, when it is a plain equality match — `[data-testid^="row-"]`
    // is a prefix query `getByTestId` cannot express, so the rule names the
    // attribute without inventing an argument for it.
    const exact = match.operator === '=' ? match.value : undefined
    const target = targetCompound(context.parsed)
    const onTarget = target?.attributes.some((attribute) => attribute === match) === true
    if (onTarget && target !== null && isOnlyHandle(target)) {
      return {
        message: `The test id [${match.name}] is addressed through a raw CSS selector.`,
        suggestion:
          exact === undefined
            ? 'Use getByTestId() instead of a CSS attribute selector.'
            : `Use getByTestId(${JSON.stringify(exact)}) instead.`,
      }
    }
    return {
      message: `The test id [${match.name}] is addressed through a raw CSS selector, alongside other conditions.`,
      suggestion:
        exact === undefined
          ? 'Scope with getByTestId() and keep the rest of the selector on the chained locator().'
          : `Scope with getByTestId(${JSON.stringify(exact)}) and keep the rest of the selector on the chained locator().`,
    }
  },
}

/**
 * True when the test id is the whole of what selects this element — no tag, no
 * class, no id, no other attribute, no pseudo. Only then is `getByTestId()` an
 * exact restatement rather than a loosening of the locator.
 */
function isOnlyHandle(target: NonNullable<ReturnType<typeof targetCompound>>): boolean {
  return (
    target.tag === undefined &&
    target.id === undefined &&
    target.classes.length === 0 &&
    target.pseudos.length === 0 &&
    target.attributes.length === 1
  )
}
