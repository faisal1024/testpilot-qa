# The Locator Quality Score

Every `testpilot analyze` run computes a single **Locator Quality Score** from 0–100 with a letter
grade. It's a deterministic, **static (Tier 1)** signal — the same files always produce the same score,
with no network, no browser, and no DOM. It's a heuristic to track and gate locator health over time,
**not** a DOM-verified measurement of how your tests will behave.

This page explains exactly how the number is produced, so you can trust it and predict how it moves.

> The worked examples below are pinned by a test
> ([`score-doc-examples.test.ts`](../packages/locator-intelligence/test/score-doc-examples.test.ts)).
> If the scorer ever changes, that test fails and this page must be updated — so the numbers here stay
> honest.

---

## The formula

```
penalty    = Σ weight(finding.severity)        # over every SCORED finding (see below)
maxPenalty = callSites × weight(error)         # the worst case for this many call-sites
score      = clamp( round( 100 × (1 − penalty / maxPenalty) ), 0, 100 )
```

- A **call-site** is one locator call the analyzer looked at (e.g. a `page.locator(...)`,
  `getByRole(...)`, `getByText(...)`). `callSites` is the denominator basis.
- **Not every finding is scored.** A rule measured per *test* cannot share a denominator counted per
  *call site*: on Ghost (95 call-sites, 321 tests) `require-test-tag` alone would turn a `98 (A)`
  into roughly `64 (D)` without a single locator changing. Such rules are **counted** in
  `summary.findings` and reported in full, and **excluded** from `penalty`. `summary.unscoredFindings`
  and `summary.unscoredRuleIds` name the exclusion, and the table and HTML report both say so — a
  silent adjustment to a number you gate on would be worse than the rule not existing.
  Today exactly one rule is unscored: [`require-test-tag`](rules/require-test-tag.md), which is also
  `off` by default.
- Each **finding** subtracts its severity's weight from the score.
- The result is rounded and clamped to `[0, 100]`, then graded.

### Severity weights

Findings are weighted by severity. The defaults:

| Severity | Default weight | Meaning |
|---|---:|---|
| `error` | **5** | A fragile pattern that should be fixed (e.g. an XPath or CSS-class selector, or a hard wait). |
| `warn`  | **2** | A risky pattern worth revisiting (e.g. a deep CSS chain or a non-user-facing locator). |
| `info`  | **0.5** | A minor nudge. |

The shipped default severities are: **`error`** — `no-xpath`, `no-css-class-selector`, `no-nth-child`,
`no-hard-wait`; **`warn`** — `no-deep-css-chain`, `prefer-user-facing-locator`. (There are no `info`
rules by default — `info` exists for rules you downgrade.)

Weights are configurable in `testpilot.config.ts` under `scoring.weights`, and **per-rule severity** is
configurable under `rules` (setting a rule to `off` removes its findings from the score entirely):

```ts
export default {
  rules: { 'no-hard-wait': 'warn' },          // change a rule's severity (or 'off' to disable)
  scoring: { weights: { error: 5, warn: 2, info: 0.5 } },
}
```

`maxPenalty` always uses the **error** weight, so it represents "every analyzed call-site is as bad as it
could be." That's why the score answers: *how close is this suite to worst-case fragility?*

### Grades

| Grade | Score | Roughly signals |
|---|---|---|
| **A** | ≥ 90 | Healthy — fragile locators are rare. |
| **B** | ≥ 80 | Good — a few patterns worth tidying. |
| **C** | ≥ 70 | Mixed — noticeable fragility. |
| **D** | ≥ 60 | Shaky — fragile locators are common. |
| **F** | < 60 | Fragile — locator quality needs real work. |

---

## How call-site count affects the score

Because `maxPenalty` scales with the number of call-sites, **the same finding hurts more in a small file
than in a large one.** One bad locator among 2 calls is a big share of the worst case; the same locator
among 50 calls is a rounding error. This is intentional: it measures the *density* of fragile locators,
not the raw count, so large healthy suites aren't dragged down by a single issue and tiny suites can't
hide one.

---

## Worked examples

**A fragile file — 53 (F).** 3 call-sites; one `error` (an XPath locator, weight 5) and one `warn`
(a non-user-facing locator, weight 2).

```
penalty = 5 + 2 = 7
maxPenalty = 3 × 5 = 15
score = round(100 × (1 − 7/15)) = round(53.3) = 53  → F
```

**Fixing the XPath lifts it to 87 (B).** Replace the XPath with `getByRole(...)`. Only the `warn`
remains:

```
penalty = 2
maxPenalty = 3 × 5 = 15
score = round(100 × (1 − 2/15)) = round(86.7) = 87  → B
```

> Fixing **one** error moved this file from **F to B**. Errors are where the points are.

**A healthy file — 98 (A).** 5 call-sites; a single `info` nudge (weight 0.5).

```
penalty = 0.5
maxPenalty = 5 × 5 = 25
score = round(100 × (1 − 0.5/25)) = round(98) = 98  → A
```

**The score never goes below 0.** 3 errors over 2 call-sites:

```
penalty = 15, maxPenalty = 2 × 5 = 10   →   1 − 15/10 = −0.5   →   clamped to 0  → F
```

---

## Why zero call-sites scores 100

If the analyzer finds **no locator call-sites at all**, `maxPenalty` is 0, there's no possible penalty,
and the score is a perfect **100 (A)** — there is no detectable locator debt.

This is a deliberate, honest default: an absent denominator means "nothing to judge," not "great tests."
A brand-new or non-UI package scores 100 simply because there's nothing fragile to find. **Don't read a
100 on an empty suite as a quality endorsement** — pair the score with coverage of what actually matters.

---

## Sub-scores

The headline decomposes into four dimensions, each computed with the **same `maxPenalty` denominator** but
only the findings whose rule category maps to it — so the dimension penalties add up to the headline
penalty:

| Sub-score | Driven by | Status |
|---|---|---|
| **Resilience** | locator rules (`no-xpath`, `no-css-class-selector`, `no-nth-child`, `no-deep-css-chain`, `prefer-user-facing-locator`) | active |
| **Flakiness** | flakiness rules (`no-hard-wait`) | active |
| **Accessibility** | *(no rules yet)* | reserved — stays 100 |
| **Maintainability** | `require-test-tag` — but it is **unscored** (see above) | reserved — stays 100 |

Example — 4 call-sites with one locator `error` (5) and one flakiness `warn` (2) — the flakiness
finding is a `warn` here because `no-hard-wait` has been downgraded from its `error` default:

```
headline:     round(100 × (1 − 7/20)) = 65
resilience:   round(100 × (1 − 5/20)) = 75    (only the locator error)
flakiness:    round(100 × (1 − 2/20)) = 90    (only the flakiness warn)
accessibility / maintainability = 100         (no *scored* rules in those dimensions)
```

Accessibility and Maintainability stay at 100 until rules exist for them — they're **reserved, not
earned**, and the docs say so rather than implying perfect scores.

---

## Gating CI on the score

Pass `--min-score <n>` (or set `scoring.minScore` in config — the flag wins) to fail the command (exit 1)
when the score is below the threshold. Without a threshold, `analyze` is reporting-only (exit 0).

```bash
testpilot analyze --min-score 80          # fail the build below B
```

For **existing** suites with known debt, gate on *new* findings instead of an absolute score with
[`--baseline`](CLI-Spec.md) — see the brownfield workflow in the [README](../README.md).

---

## What the score is **not**

- **Not DOM-aware.** It's static Tier 1: it reasons about how a locator is *written*, never about the
  page it runs against. A locator that scores well can still be wrong; one flagged as fragile might be
  fine in context. Static guesses are never presented as DOM-backed facts.
- **Not a coverage or correctness metric.** It says nothing about whether your tests assert the right
  things — only about locator fragility and flaky-wait patterns.
- **Not a moving target.** It's fully deterministic: same inputs, same score, every run.
