import type { RuleExplanation } from '@testpilot/core'
import { noCssClassSelector } from './rules/no-css-class-selector.js'
import { noDeepCssChain } from './rules/no-deep-css-chain.js'
import { noHardWait } from './rules/no-hard-wait.js'
import { noNthChild } from './rules/no-nth-child.js'
import { noXpath } from './rules/no-xpath.js'
import { preferUserFacingLocator } from './rules/prefer-user-facing-locator.js'
import type { Rule } from './rules/types.js'

/** The educational fields — id/category/severity/docsUrl come from the rule itself. */
type Education = Pick<
  RuleExplanation,
  'title' | 'summary' | 'whyItMatters' | 'badExample' | 'betterExample' | 'guidance'
>

function fromRule(rule: Rule, education: Education): RuleExplanation {
  return {
    id: rule.id,
    category: rule.category,
    defaultSeverity: rule.defaultSeverity,
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
    ],
  }),
  fromRule(noNthChild, {
    title: 'Avoid positional selection',
    summary:
      'Selecting by position (:nth-child or .nth()) depends on sibling order and breaks when items move.',
    whyItMatters:
      'Positional locators assume a fixed order and count of elements. Adding, removing, or reordering items — common as features evolve or data changes — silently retargets the locator to the wrong element.',
    badExample: `await page.locator('ul li:nth-child(2)').click()
// or
await page.getByRole('listitem').nth(1).click()`,
    betterExample: `await page.getByRole('link', { name: 'Settings' }).click()`,
    guidance: [
      'Target the element by something it owns — its name, label, or text.',
      'If you must work within a list, scope by a stable attribute rather than an index.',
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
    ],
  }),
  fromRule(preferUserFacingLocator, {
    title: 'Prefer user-facing locators',
    summary:
      'Raw CSS/text locator() strings are less resilient than Playwright user-facing locators.',
    whyItMatters:
      'Playwright recommends locating elements the way users and assistive technology perceive them — by role, label, placeholder, or text. Those locators survive refactors and double as lightweight accessibility checks; raw locator() css/text strings bypass that resilience.',
    badExample: `await page.locator('input[name="email"]').fill('user@example.com')`,
    betterExample: `await page.getByLabel('Email').fill('user@example.com')`,
    guidance: [
      'Reach for getByRole / getByLabel / getByPlaceholder / getByText first.',
      'Use getByTestId when there is no good semantic handle.',
      'Keep locator() for cases none of the above can express.',
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
