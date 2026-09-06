import type { ParsedSelector } from './selector/types.js'
/** A Playwright locator-producing (or locator-refining) method we recognize. */
export type LocatorApi =
  | 'locator'
  | 'frameLocator'
  | 'first'
  | 'last'
  | 'getByRole'
  | 'getByText'
  | 'getByLabel'
  | 'getByPlaceholder'
  | 'getByAltText'
  | 'getByTitle'
  | 'getByTestId'
  | 'nth'

/** A Playwright hard-wait method (flakiness, not a locator). */
export type HardWaitApi = 'waitForTimeout'

/** Any call-site the extractor recognizes. */
export type AnalyzedApi = LocatorApi | HardWaitApi

/** The selector engine inferred for `locator()`/`frameLocator()` string arguments. */
export type SelectorEngine = 'css' | 'xpath' | 'text'

/**
 * A normalized call-site — the unit a rule evaluates. Despite the name it also
 * covers a small set of non-locator call-sites (hard waits) so flakiness rules
 * can run through the same engine.
 *
 * Milestone 3B is static-only: there is no DOM context. The shape leaves room
 * for an optional `dom` field in a later tier without changing rule signatures.
 */
export interface LocatorContext {
  /** The recognized method name, e.g. `locator`, `getByRole`, `nth`, `waitForTimeout`. */
  apiCall: AnalyzedApi
  /** The first string argument, when it is a static literal. */
  selector?: string
  /** Engine inferred from the selector string (only for `locator`/`frameLocator`). */
  selectorEngine?: SelectorEngine
  /** True when a string argument was expected but is not statically known. */
  isDynamic: boolean
  /**
   * The tokenized selector, for `locator`/`frameLocator` calls with a readable
   * string argument. Parsed once per call site and shared by every rule, so
   * they cannot disagree about what a selector says.
   */
  parsed?: ParsedSelector
  /**
   * The method this call is chained off, when the receiver is itself a
   * recognized locator call: `page.getByRole('row').locator('.cell')` gives
   * `getByRole`.
   *
   * 11b needs it — `prefer-semantic-locator` must not fire on a `locator()`
   * refining a `getBy*()` parent — and it is not in the selector at all, so a
   * rule could only recover it by regexing `raw`, which is the technique the
   * tokenizer exists to delete.
   */
  parentApi?: LocatorApi
  /**
   * Which composition options the call passed, e.g.
   * `locator('.row', { hasText: 'Save' })`. Presence is what matters to a rule,
   * not the value.
   */
  options?: {
    has?: boolean
    hasNot?: boolean
    hasText?: boolean
    hasNotText?: boolean
  }
  /** Source text of the whole call expression, e.g. `page.locator('.btn-primary')`. */
  raw: string
  /** 1-based line of the method name. */
  line: number
  /** 1-based column of the method name. */
  column: number
}
