import type { RuleExplanation } from '@testpilot/core'
import { avoidParentTraversal } from './rules/avoid-parent-traversal.js'
import { avoidPositionalAccess } from './rules/avoid-positional-access.js'
import { noCssClassSelector } from './rules/no-css-class-selector.js'
import { noDeepCssChain } from './rules/no-deep-css-chain.js'
import { noHardWait } from './rules/no-hard-wait.js'
import { noNthChild } from './rules/no-nth-child.js'
import { noXpath } from './rules/no-xpath.js'
import { preferGetByTestId } from './rules/prefer-get-by-test-id.js'
import { preferSemanticLocator } from './rules/prefer-semantic-locator.js'
import { requireTestTag } from './rules/require-test-tag.js'
import type { AnyRule } from './rules/types.js'

/** The educational fields — id/category/severity/docsUrl come from the rule itself. */
type Education = Pick<
  RuleExplanation,
  'title' | 'summary' | 'whyItMatters' | 'badExample' | 'betterExample' | 'guidance' | 'notFlagged'
>

function fromRule(rule: AnyRule, education: Education): RuleExplanation {
  return {
    id: rule.id,
    category: rule.category,
    defaultSeverity: rule.defaultSeverity,
    ...(rule.defaultOff === true ? { defaultOff: true } : {}),
    docsUrl: rule.docsUrl,
    ...education,
  }
}

const EXPLANATIONS: RuleExplanation[] = [
  fromRule(noXpath, {
    title: 'Avoid XPath selectors',
    summary: 'XPath selectors couple tests to the DOM tree and break when structure changes.',
    whyItMatters:
      'XPath targets elements by their position in the document tree, so any markup refactor — a new wrapper element or reordered nodes — silently breaks the locator. User-facing locators target what a user (and assistive technology) perceives, which is far more stable.',
    badExample: `await page.locator('//button[@type="submit"]').click()`,
    betterExample: `await page.getByRole('button', { name: 'Submit' }).click()`,
    guidance: [
      'Prefer getByRole / getByLabel / getByText / getByTestId.',
      'Reach for XPath only for the rare case CSS and user-facing locators genuinely cannot express.',
    ],
    notFlagged: [
      `page.locator('..')                  // parent traversal — see avoid-parent-traversal`,
      `page.locator('[href="//cdn.x"]')    // a slash inside a quoted attribute value`,
      `page.getByRole('button')            // not a selector string at all`,
    ],
  }),
  fromRule(noCssClassSelector, {
    title: 'Avoid CSS class selectors',
    summary: 'Class names exist for styling and change often, so class-based locators are brittle.',
    whyItMatters:
      'CSS classes are owned by your styling layer (design systems, CSS modules, utility frameworks). They get renamed, hashed, or removed during refactors with no intent to change behavior, so class-based locators break for reasons unrelated to the feature under test.',
    badExample: `await page.locator('.btn-primary').click()`,
    betterExample: `await page.getByRole('button', { name: 'Save' }).click()`,
    guidance: [
      'Prefer role/label/text locators that reflect what the user sees.',
      'If there is no semantic handle, add a stable data-testid and use getByTestId().',
      'A class nested in `:has()`, `:not()` or `:is()` counts — the test depends on it either way.',
    ],
    notFlagged: [
      `page.locator('[href=".pdf"]')      // a dot inside a quoted attribute value is not a class`,
      `page.locator('#main')              // an id is a different trade-off, not this rule's business`,
      `page.locator('text=Save file.txt') // not a CSS selector at all`,
      `page.locator('button:has-text("a.b")') // :has-text() takes text, not a selector`,
    ],
  }),
  fromRule(noNthChild, {
    title: 'Avoid :nth-child() selectors',
    summary:
      'A CSS :nth-child() or :nth-last-child() selector depends on sibling order and breaks when items move.',
    whyItMatters:
      'Positional locators assume a fixed order and count of elements. Adding, removing, or reordering items — common as features evolve or data changes — silently retargets the locator to the wrong element.',
    badExample: `await page.locator('ul li:nth-child(2)').click()`,
    betterExample: `await page.getByRole('link', { name: 'Settings' }).click()`,
    guidance: [
      'Target the element by something it owns — its name, label, or text.',
      'If you must work within a list, scope by a stable attribute rather than an index.',
    ],
    notFlagged: [
      `page.getByRole('row').nth(1)   // positional API access — see avoid-positional-access`,
      `page.locator('li:nth-of-type(2)') // a type-based sibling filter, not a positional index`,
      `page.locator('[data-nth-child]')  // an attribute that merely contains the word`,
    ],
  }),
  fromRule(noDeepCssChain, {
    title: 'Avoid deep CSS selector chains',
    summary:
      'Long descendant/child chains encode the DOM hierarchy and break on structural changes.',
    whyItMatters:
      'A chain like "header nav ul li a" hard-codes an entire ancestry. Any intermediate change — a new wrapper, a layout refactor — breaks it, and the deeper the chain the more brittle the locator becomes.',
    badExample: `await page.locator('header nav ul li a').click()`,
    betterExample: `await page.getByRole('link', { name: 'Docs' }).click()`,
    guidance: [
      'Prefer a single user-facing locator over a structural path.',
      'Use locator chaining (locator.getByRole(...)) only to scope, not to encode DOM depth.',
      'Depth is counted per selector, so a comma-separated list of shallow selectors is not a deep chain.',
      "The threshold defaults to 3 and is configurable: `ruleOptions: { 'no-deep-css-chain': { maxChainDepth: 4 } }` (1-20).",
    ],
    notFlagged: [
      `page.locator('strong em, em strong')  // two one-step selectors, not a three-step chain`,
      `page.locator('[title="a b c d"]')     // whitespace inside a value is not a combinator`,
    ],
  }),
  fromRule(preferGetByTestId, {
    title: 'Use getByTestId() for test ids',
    summary:
      'A test id addressed through a raw CSS attribute selector has an exact getByTestId() equivalent.',
    whyItMatters:
      "When a locator's only handle is a test id, `locator('[data-testid=\"save\"]')` and `getByTestId('save')` select the same element — but only the second says so. The CSS form hides the intent behind attribute syntax, silently ignores a project's configured `testIdAttribute`, and does not survive a change to it. This is the one case in this category with a mechanical, behavior-preserving rewrite, which is why it is a `warn` where the general nudge is an `info`.",
    badExample: `await page.locator('[data-testid="save-button"]').click()`,
    betterExample: `await page.getByTestId('save-button').click()`,
    guidance: [
      'Set `testIdAttribute` in `playwright.config.ts` if your project uses something other than `data-testid`, then use getByTestId() everywhere.',
      "Tell TestPilot which attributes are test ids with `ruleOptions: { 'prefer-get-by-test-id': { testIdAttributes: ['data-qa'] } }` — the default list is `data-testid`, `data-test-id`, `data-test`.",
      "When the test id is on an ancestor rather than the target, make it the scope: `getByTestId('list').locator('li a')`.",
      'A non-equality match such as `[data-testid^="row-"]` has no getByTestId() form; the rule names the attribute without inventing an argument.',
    ],
    notFlagged: [
      `page.getByTestId('save-button')        // already the recommended form`,
      `page.locator('[data-qa="save"]')       // not a test id unless you configure it`,
      `page.locator('[aria-label="Save"]')    // not a test id at all`,
      `page.locator('[data-testid]')          // presence: getByTestId() has no such form`,
      `page.locator('div:not([data-testid="x"])') // names an element the selector EXCLUDES`,
      `page.locator('li:has([data-testid="x"])')  // names a descendant, not the target`,
      `page.locator('[data-testid="a"], [data-testid="b"]') // a list has no one target`,
      `page.locator('[data-testid="row"] + button') // a sibling, not an ancestor`,
    ],
  }),
  fromRule(preferSemanticLocator, {
    title: 'Prefer a semantic locator',
    summary:
      'A raw tag, class, #id or text= selector says nothing about what the element is to a user.',
    whyItMatters:
      'Playwright recommends locating elements the way users and assistive technology perceive them — by role, label, placeholder, or text. Those locators survive refactors and double as lightweight accessibility checks. A selector built from structure alone breaks whenever the markup moves, for reasons unrelated to the feature under test. Tier 1 is static, so this rule cannot name the replacement — it is a nudge to look, which is why it ships at `info` and not `warn`.',
    badExample: `await page.locator('#login-form div.actions > button').click()`,
    betterExample: `await page.getByRole('button', { name: 'Log in' }).click()`,
    guidance: [
      'Reach for getByRole / getByLabel / getByPlaceholder / getByText first.',
      'Use getByTestId when there is genuinely no semantic handle — and add the test id to the markup rather than reaching for a class.',
      'Keep locator() for what none of the above can express; set this rule to `off` if your suite has made that call deliberately.',
    ],
    notFlagged: [
      `page.locator('[role="tab"]')                    // a role is a semantic handle`,
      `page.locator('[aria-label="Close"]')            // so is any aria-* attribute`,
      `page.locator('.row', { hasText: 'Save' })       // composed: the selector is a scope`,
      `page.locator('li:has-text("Save")')             // the same composition, in selector syntax`,
      `page.getByRole('row').locator('td')             // narrowing a user-facing parent`,
      `page.locator('[data-testid="save"]')            // see prefer-get-by-test-id`,
    ],
  }),
  fromRule(noHardWait, {
    title: 'Avoid hard waits',
    summary: 'Fixed waitForTimeout() sleeps make tests slow and flaky.',
    whyItMatters:
      'A hard wait is either too long (wasting time when the app was ready sooner) or too short (flaky failures under load). Playwright auto-waits for elements to be actionable and for assertions to pass, so fixed sleeps are almost never necessary.',
    badExample: `await page.waitForTimeout(1000)
await page.getByRole('button', { name: 'Save' }).click()`,
    betterExample: `// Playwright auto-waits for actionability; assert the state you need:
await page.getByRole('button', { name: 'Save' }).click()
await expect(page.getByRole('alert')).toHaveText('Saved')`,
    guidance: [
      'Rely on Playwright auto-waiting for actionability.',
      'Use web-first assertions like expect(locator).toBeVisible() / toHaveText().',
      'Wait for a specific condition (e.g. waitForResponse) instead of a fixed delay.',
    ],
    notFlagged: [
      `await expect(page.getByText('Saved')).toBeVisible()  // a web-first assertion, which waits`,
      `await page.getByRole('button').click()               // auto-waiting is built in`,
    ],
  }),
  fromRule(avoidPositionalAccess, {
    title: 'Prefer identity over position',
    summary:
      'Selecting by position depends on how many elements match and in what order. Detects `.nth()` today; `.first()`/`.last()` arrive with Phase 12.',
    whyItMatters:
      'A positional call silently retargets when the matched collection changes — a new row, a reordered list, a filter applied earlier in the test. It does not fail loudly; it acts on a different element. That said, picking one of an intentionally repeated element is idiomatic Playwright and appears throughout its own docs, which is why this is a `warn` and not an error: it is a nudge to check whether the element has an identity you could target instead.',
    badExample: `await page.getByRole('listitem').nth(1).click()`,
    betterExample: `await page.getByRole('link', { name: 'Settings' }).click()`,
    guidance: [
      'If the element is distinguishable — a name, a label, a test id — target it directly, or narrow with `filter({ hasText })`.',
      'If the collection is genuinely uniform (a row in a results table, an ordered list the test is *about*), positional access is correct; set this rule to `off`.',
      'CSS `:nth-child()` is a different matter and stays an error — see `no-nth-child`.',
      "**Only `.nth()` is detected today.** `.first()` and `.last()` are the same pattern, but counting them changes the score's denominator, so they arrive with Phase 12.",
    ],
    notFlagged: [
      `page.getByRole('button', { name: 'Save' })  // targeted by identity, not position`,
      `page.locator('li:nth-child(2)')             // a CSS positional selector — see no-nth-child`,
    ],
  }),
  fromRule(avoidParentTraversal, {
    title: "Avoid locator('..') parent traversal",
    summary:
      "locator('..') walks up to the parent element, so the test depends on how the DOM is nested.",
    whyItMatters:
      "Reaching a container by walking up from a child couples the test to the exact nesting between them: wrap the child in one more div and the locator points somewhere else. It is a recognised Playwright idiom rather than hand-written XPath, which is why it is `info` and lives apart from `no-xpath` — on real suites it was the majority of that rule's findings, and reporting it at error meant the genuinely hand-written XPath did not stand out.",
    badExample: `await page.getByText('Total').locator('..').click()`,
    betterExample: `await page.getByRole('row', { name: 'Total' }).click()`,
    guidance: [
      'Locate the container directly — getByRole with a name, or getByTestId — then narrow inside it.',
      'If the container genuinely has no handle of its own, adding a data-testid to it is usually the smaller change.',
    ],
    notFlagged: [
      `page.locator('//button[@type="submit"]')  // hand-written XPath — see no-xpath`,
      `page.getByRole('row').getByRole('cell')   // narrowing down, not walking up`,
    ],
  }),
  fromRule(requireTestTag, {
    title: 'Tag every test',
    summary:
      'A test with no tag cannot be selected by any tag-based run, so it silently misses every suite.',
    whyItMatters:
      'Once a team runs subsets by tag — a smoke suite on every PR, a nightly regression run — an untagged test belongs to none of them. It still runs in the full suite, so nothing fails; it just quietly stops being covered by the runs people actually watch. This rule is off by default and only worth enabling once you have a vocabulary to be consistent with.',
    badExample: `test('checkout works', async ({ page }) => { … })`,
    betterExample: `test('checkout works @smoke', async ({ page }) => { … })
// or
test('checkout works', { tag: ['@smoke'] }, async ({ page }) => { … })`,
    guidance: [
      'Run `testpilot tags` first — tag from the vocabulary the suite already uses, not a new one.',
      'A tag on a `test.describe` counts for every test inside it, which is usually the cheapest way to cover a group.',
      "Enable with `rules: { 'require-test-tag': 'info' }`; it is `off` by default.",
      'Findings from this rule are counted but not scored — the Locator Quality Score measures locators, over a denominator of call sites.',
    ],
    notFlagged: [
      `test('checkout works @smoke', async ({ page }) => {})`,
      `test('checkout works', { tag: ['@smoke'] }, async ({ page }) => {})`,
    ],
  }),
]

/** Rule explanations keyed by rule id. */
export const ruleExplanations: Record<string, RuleExplanation> = Object.fromEntries(
  EXPLANATIONS.map((explanation) => [explanation.id, explanation]),
)

/** Looks up a rule explanation by id. */
export function getExplanation(id: string): RuleExplanation | undefined {
  return ruleExplanations[id]
}

/** Sorted list of rule ids that have an explanation. */
export function explanationIds(): string[] {
  return Object.keys(ruleExplanations).sort()
}
