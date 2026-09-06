import { testIdReplacement } from '../selector/test-id.js'
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

/** Playwright's own `testIdAttribute` default — the attribute `getByTestId()` queries. */
export const PLAYWRIGHT_DEFAULT_TEST_ID_ATTRIBUTE = 'data-testid'

/**
 * Whether `getByTestId()` would query this exact attribute.
 *
 * `getByTestId()` resolves **one** attribute — `use.testIdAttribute` from the
 * Playwright config, defaulting to `data-testid`. So on a stock config
 * `locator('[data-test="x"]')` and `getByTestId('x')` select different
 * elements, and naming the second as a replacement for the first is the same
 * class of wrong rewrite this rule has produced five times. The rule still
 * reports — a test id in raw CSS is worth flagging either way — but it says
 * what has to be true for the rewrite to hold.
 */
function queriedBy(attribute: string, resolved: RuleOptions['resolvedTestIdAttribute']): boolean {
  return resolved === undefined || resolved === 'unresolved'
    ? // Nothing was read. Only the attribute Playwright queries by default can
      // be asserted, and even that only because it is the overwhelming case.
      attribute === PLAYWRIGHT_DEFAULT_TEST_ID_ATTRIBUTE
    : attribute === (resolved ?? PLAYWRIGHT_DEFAULT_TEST_ID_ATTRIBUTE)
}

/**
 * How to say "and here is what your config must say for that to be true".
 *
 * Distinguishes the three states rather than collapsing them: a config that
 * was read and sets nothing really does mean `data-testid`, while a config
 * that could not be read means we do not know — and stating the default there
 * is a claim about a file we failed to open.
 */
function configCaveat(attribute: string, resolved: RuleOptions['resolvedTestIdAttribute']): string {
  const unknown = resolved === undefined || resolved === 'unresolved'
  const queried = unknown
    ? `the \`testIdAttribute\` your Playwright config declares (default \`${PLAYWRIGHT_DEFAULT_TEST_ID_ATTRIBUTE}\`), which could not be read here`
    : `\`${resolved ?? PLAYWRIGHT_DEFAULT_TEST_ID_ATTRIBUTE}\`${
        resolved === null ? " (Playwright's default)" : ''
      }`
  return ` getByTestId() queries only ${queried}, not \`${attribute}\` — set \`use: { testIdAttribute: '${attribute}' }\` in your Playwright config, or locate by the attribute it already declares.`
}

/** The configured test-id attribute names, or the defaults. */
export function testIdAttributesFrom(options: RuleOptions | undefined): readonly string[] {
  const configured = options?.testIdAttributes
  return configured && configured.length > 0 ? configured : DEFAULT_TEST_ID_ATTRIBUTES
}

/**
 * Flags `locator('[data-testid="x"]')` — a test id addressed through a raw CSS
 * attribute selector, when `getByTestId()` says the same thing.
 *
 * Split out of `prefer-user-facing-locator` in Phase 11b because it is the one
 * case with a concrete answer: the rule can print the replacement instead of
 * the category-level "prefer user-facing locators" that made the old rule 65%
 * of every finding the tool reported.
 *
 * Naming a replacement is the strongest claim this package makes, so *where*
 * the test id sits decides what may be said — see {@link testIdReplacement}.
 * The distinction is not cosmetic: `getByTestId('row').locator('button')`
 * queries the **subtree**, so offering it for `button[data-testid="row"]`
 * (which selects one element) changes which element the test acts on.
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
    // `locator('[data-testid=row]', { hasText: 'Alice' })` is not
    // `getByTestId('row')` — that selects every row. `getByTestId()` has no
    // form for the options bag, so a rule whose severity is earned by naming
    // the exact replacement has nothing to name.
    //
    // Only the call's OWN options: a chained `.filter({ hasText })` survives
    // the rewrite, because only the `locator()` call is being replaced.
    const own = context.ownOptions
    if (
      own === 'unknown' ||
      own?.has === true ||
      own?.hasNot === true ||
      own?.hasText === true ||
      own?.hasNotText === true
    ) {
      return null
    }
    const names = testIdAttributesFrom(options)
    // Playwright's own `data-testid=save` engine: already a test id, still not
    // `getByTestId()`, and invisible to the CSS attribute scan below.
    const [only] = context.parsed.parts
    if (only?.engine === 'test-id' && context.parsed.parts.length === 1) {
      // `data-test=`/`data-test-id=` are engines of their own, and getByTestId()
      // queries neither unless the config says so.
      const engine = only.engineName ?? PLAYWRIGHT_DEFAULT_TEST_ID_ATTRIBUTE
      return {
        message: `The ${engine}= selector engine addresses a test id.`,
        suggestion: `Use getByTestId(${JSON.stringify(only.body)}) instead.${
          queriedBy(engine, options?.resolvedTestIdAttribute)
            ? ''
            : configCaveat(engine, options?.resolvedTestIdAttribute)
        }`,
      }
    }
    const replacement = testIdReplacement(context.parsed, names)
    if (replacement === null) {
      return null
    }
    const { attribute, exactValue } = replacement
    const named =
      exactValue === undefined ? 'getByTestId()' : `getByTestId(${JSON.stringify(exactValue)})`
    const inexact =
      exactValue === undefined
        ? ' getByTestId() also accepts a RegExp for a partial or case-insensitive match.'
        : ''
    const caveat = queriedBy(attribute, options?.resolvedTestIdAttribute)
      ? ''
      : configCaveat(attribute, options?.resolvedTestIdAttribute)
    if (replacement.kind === 'direct') {
      return {
        message: `The test id [${attribute}] is addressed through a raw CSS selector.`,
        suggestion: `Use ${named} instead.${inexact}${caveat}`,
      }
    }
    if (replacement.kind === 'scope') {
      // `ul[data-testid=x] > li a`: scoping with getByTestId() alone drops the
      // `ul`, which is a widening, not the behaviour-preserving rewrite the
      // simple case gets.
      const widening = replacement.scopeHasOtherConditions
        ? ' Note the ancestor carries conditions beyond the test id, which getByTestId() does not express.'
        : ''
      return {
        message: `The test id [${attribute}] is on an ancestor of the element this selector targets.`,
        suggestion: `Scope with ${named} and keep the rest of the selector — combinator included — on a chained locator().${widening}${inexact}${caveat}`,
      }
    }
    // same-element: the remaining conditions are on the target itself, so they
    // cannot become a chained `locator()` — that would search inside it.
    return {
      message: `The test id [${attribute}] is addressed through a raw CSS selector, alongside other conditions on the same element.`,
      suggestion: `Use ${named} for the test id. The rest of this selector constrains the same element, so it cannot move to a chained locator() — narrow with filter() or and(), or rely on the test id alone if it is unique.${inexact}${caveat}`,
    }
  },
}
