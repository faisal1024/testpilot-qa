/** A Playwright locator-producing method we recognize. */
export type LocatorApi =
  | 'locator'
  | 'frameLocator'
  | 'getByRole'
  | 'getByText'
  | 'getByLabel'
  | 'getByPlaceholder'
  | 'getByAltText'
  | 'getByTitle'
  | 'getByTestId'

/** The selector engine inferred for `locator()`/`frameLocator()` string arguments. */
export type SelectorEngine = 'css' | 'xpath' | 'text'

/**
 * A normalized locator call-site — the unit a rule evaluates.
 *
 * Milestone 3A is static-only: there is no DOM context. The shape leaves room
 * for an optional `dom` field in a later tier without changing rule signatures.
 */
export interface LocatorContext {
  /** The recognized method name, e.g. `locator` or `getByRole`. */
  apiCall: LocatorApi
  /** The first string argument, when it is a static literal. */
  selector?: string
  /** Engine inferred from the selector string (only for `locator`/`frameLocator`). */
  selectorEngine?: SelectorEngine
  /** True when the first argument is not a static string (variable, interpolation, …). */
  isDynamic: boolean
  /** Source text of the whole call expression, e.g. `page.locator('.btn-primary')`. */
  raw: string
  /** 1-based line of the call-site. */
  line: number
  /** 1-based column of the call-site. */
  column: number
}
