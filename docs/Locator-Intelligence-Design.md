# TestPilot QA — Locator Intelligence Design

> Status: Approved — aligned to *Updated Plan After Claude Review*
> The differentiating capability of TestPilot QA.

> **Alignment note (approved plan):** The **MVP (Tier 1) rule set is nine scored rules** (plus
> `require-test-tag`, added in Phase 10e — `off` by default and excluded from the score) —
> `no-xpath`, `no-nth-child`, `no-css-class-selector`, `no-deep-css-chain`,
> `prefer-get-by-test-id`, `prefer-semantic-locator`, `no-hard-wait`. Sub-scores are Resilience, Accessibility,
> Maintainability, Flakiness. Tier 1 must **never emit a concrete locator it cannot prove**
> (no `getByRole('button', { name: 'Save' })` without DOM context) — only category-level guidance.
> All other rules in the catalog below are tagged for V1+.

---

## 1. Purpose

Locator Intelligence detects fragile selectors in Playwright tests, scores locator quality, explains *why* a selector is fragile, and (progressively) suggests concrete, resilient replacements aligned with Playwright's recommended hierarchy. It is both a **linter** and a **teacher**.

The teaching dimension matters: most fragile locators exist because the engineer didn't know `getByRole` existed or didn't know the element had an accessible name. A finding that only says "bad" fails the mission; a finding that says "bad, here's why, here's the better category, here's the rule" changes behavior.

---

## 2. The Locator Quality Hierarchy

TestPilot encodes Playwright's own guidance as a ranked preference. Higher tier = more resilient and more accessible.

| Tier | Strategy | Resilience | Notes |
|---|---|---|---|
| **A — User-facing, semantic** | `getByRole`, `getByLabel`, `getByPlaceholder`, `getByText`, `getByAltText`, `getByTitle` | Highest | Mirrors how a user/AT perceives the page; survives DOM refactors. |
| **B — Explicit test contract** | `getByTestId` | High | Stable *by contract*, but requires app cooperation; not accessibility-validating. |
| **C — Structural / brittle** | `locator('css...')`, `locator('text=...')` (raw engine strings), chained `nth()` | Low | Couples tests to DOM structure & styling. |
| **D — Forbidden by default** | XPath, `nth-child`, deep descendant chains, class/id selectors tied to styling | Lowest | Breaks on any structural or styling change. |

`getByText` is Tier A for semantic content but flagged when used on dynamic/interpolated text. `getByTestId` is excellent for stability but **does not** validate accessibility — so a suite that's 100% test-ids scores well on stability and poorly on the accessibility sub-score. That tension is intentional and surfaced (§4).

---

## 3. Rules Engine

### 3.1 Rule model

```ts
interface Rule {
  id: string                       // 'no-css-class-selector'
  category: 'locator' | 'flakiness' | 'accessibility' | 'maintainability'
  severity: 'info' | 'warn' | 'error'
  requiresDom: boolean             // true → skipped in Tier 1 static runs
  autoFixable: boolean
  docsUrl: string
  description: string
  evaluate(ctx: LocatorContext, cfg: RuleConfig): Finding | null
}
```

- **Pure & deterministic** — no I/O, no global state. Same `LocatorContext` → same `Finding`.
- **Registered, not hard-coded** — built-in rules and third-party rule packs load through the same registry.
- **DOM-aware rules opt in** via `requiresDom: true` and are skipped when DOM context is absent, so the static run never produces a low-confidence concrete suggestion it can't back up.

### 3.2 `LocatorContext` (shared with Architecture.md §6.1)

```ts
interface LocatorContext {
  raw: string                              // 'page.locator(".btn-primary")'
  apiCall: LocatorApi                      // 'locator' | 'getByRole' | 'xpath' | ...
  selectorEngine?: 'css' | 'xpath' | 'text' | 'mixed'
  args: ParsedArgs                         // structured from AST, not regex
  chain: ChainOp[]                         // .filter().nth(2).first() etc.
  sourceRef: { file: string; line: number; column: number }
  dom?: DomContext                         // Tier 2 only
}

interface DomContext {
  matchCount: number                       // how many elements the selector hits
  role?: string
  accessibleName?: string
  testId?: string
  isVisible: boolean
  candidateLocators: CandidateLocator[]    // ranked resilient alternatives
}
```

### 3.3 Pipeline

```
files → parser (@typescript-eslint/parser) → AST
      → locator call-site extractor → LocatorContext[]
      → [optional] DOM enrichment (trace/live) → LocatorContext[] (+dom)
      → rules engine (each ctx × each enabled rule) → Finding[]
      → scorer → Report (json → table/html/sarif)
```

**Why AST, not regex:** regex can't reliably tell `page.locator(userVar)` from `page.locator('.x')`, can't follow chains, and produces false positives on comments/strings. AST gives precise call-sites, argument types, and chain structure — and reuses tooling the ecosystem already trusts.

---

## 4. Scoring Model

### 4.1 Goals

- A **single headline number** (0–100) that's intuitive and trends upward as the suite improves.
- **Sub-scores** so a team can see *which* dimension is weak.
- **Stable & monotonic** — fixing a finding never lowers the score; adding a good locator never lowers it.
- **Volume-aware** — one bad locator in 500 shouldn't read the same as 50 bad in 100.

### 4.2 Formula

For a file/project with locator call-sites `L` and findings `F`:

```
penalty = Σ_findings ( severityWeight(f) )           // error=5, warn=2, info=0.5 (configurable)
maxPenalty = |L| × severityWeight(error)              // worst case: every locator is an error
rawScore = 100 × (1 − penalty / maxPenalty)
score = clamp(round(rawScore), 0, 100)
```

Normalizing by `|L|` (locator count), not file count, makes the score density-based and fair across files of different sizes.

### 4.3 Sub-scores

The headline score decomposes into weighted dimensions, each computed the same way over its rule category:

| Sub-score | Driven by rules in category | Question it answers |
|---|---|---|
| **Resilience** | `locator` | Will these locators survive a refactor? |
| **Accessibility** | `accessibility` | Do locators exercise the a11y tree (role/label)? |
| **Flakiness risk** | `flakiness` | Hard waits, conditionals, race-prone patterns? |
| **Maintainability** | `maintainability` | Duplication, magic strings, missing POM structure? |

Headline = weighted mean (default weights configurable). This is why "100% test-ids" can score high on Resilience but mid on Accessibility — the number tells the truth.

### 4.4 Grading & trend

- Letter band for quick reading: A `90–100`, B `80–89`, C `70–79`, D `60–69`, F `<60`.
- `analyze --baseline` reports **delta** (e.g. `78 → 84, +6`) so PRs show improvement, and brownfield projects can gate on "no regression" rather than an unreachable absolute.

---

## 5. Rule Catalog

### 5.1 MVP rule set (Tier 1, static — nine scored rules, plus one opt-in test-organization rule)

| Rule id | Cat | Sev | DOM? | Auto-fix | Detects |
|---|---|---|---|---|---|
| `no-xpath` | locator | error | no | no | XPath engine usage. |
| `no-nth-child` | locator | error | no | no | `:nth-child`, positional CSS. |
| `no-css-class-selector` | locator | error | no | no | `.class` selectors tied to styling. |
| `no-deep-css-chain` | locator | warn | no | no | Long ` > ` / descendant CSS chains. |
| `prefer-get-by-test-id` | locator | warn | no | yes (Phase 13) | A test id addressed through a raw CSS attribute selector, when `getByTestId()` says the same thing. Attribute list configurable via `ruleOptions`. |
| `prefer-semantic-locator` | locator | info | no | no | A `locator()` selector with no role/label/ARIA handle. Abstains on `[role=]`/`[aria-*]`, `has`/`hasText` composition, a `getBy*()` parent, and test ids. **Category guidance only — no concrete rewrite in Tier 1.** |
| `no-hard-wait` | flakiness | error | no | no¹ | `waitForTimeout(<n>)` hard sleeps. |
| `require-test-tag` | maintainability | **off** (`info` when enabled) | no | no¹ | A `test()` carrying no tag, so no tag-based run can select it. Evaluates a **test declaration**, not a locator call site. Counted but **not scored**. |

¹ Auto-fix for any rule is a **V1** capability (the `fix` command is deferred); MVP detects and educates only.

### 5.2 V1 additions (still static)

| Rule id | Cat | Sev | Auto-fix | Detects |
|---|---|---|---|---|
| `no-id-structural-selector` | locator | warn | no | `#id`/`> div >` structural chains. |
| `prefer-text-helper` | locator | info | yes | `locator('text=Foo')` → `getByText('Foo')`. |
| `no-dynamic-text-locator` | locator | warn | no | `getByText` on interpolated/changing text. |
| `prefer-test-id-config` | locator | info | no | `getByTestId` used but `testIdAttribute` not configured. |
| `no-conditional-in-test` | flakiness | warn | no | `if`/`try` branching test flow (non-determinism). |
| `prefer-web-first-assertions` | flakiness | warn | partial | Manual polling instead of `expect(locator).to...`. |
| `no-network-without-mock` | flakiness | info | no | Live network calls without route mocking in UI tests. |

### 5.3 Tier 2 (DOM-aware — V2)

| Rule id | Cat | Sev | Auto-fix | Detects |
|---|---|---|---|---|
| `suggest-concrete-locator` | locator | warn | yes | Emits exact resilient rewrite from DOM. |
| `non-unique-locator` | locator | error | no | Selector matches `>1` element (strict-mode trap). |
| `locator-missing-accessible-name` | accessibility | warn | no | Target has no accessible name (also an app a11y bug). |

Each rule ships with a `docsUrl` page (and a `testpilot explain <ruleId>` entry): rationale, a bad example, a good example, and links to the relevant Playwright doc.

---

## 6. Suggestions

### 6.1 Two confidence levels

- **Category suggestion (Tier 1, static):** "Prefer a role-based locator such as `getByRole('button', { name: ... })`." Honest about not knowing the exact name. Never auto-applied.
- **Concrete suggestion (Tier 2, DOM):** "Replace with `getByRole('button', { name: 'Save changes' })`." Backed by DOM evidence (role + accessible name + uniqueness check). Auto-fixable.

Never present a Tier-1 guess as if it were Tier-2 fact. This is a trust boundary — a wrong "concrete" suggestion that doesn't compile destroys credibility faster than no suggestion.

### 6.2 Concrete-suggestion algorithm (Tier 2)

Given a DOM-enriched context, rank candidate locators:

```
1. getByRole(role, { name })         if element has role + unique accessible name
2. getByLabel / getByPlaceholder     for form controls with a label/placeholder
3. getByText                          for unique, stable, non-interpolated text
4. getByTestId                        if a configured test-id attribute exists
5. scoped getByRole within a region   if global match is non-unique
6. (last resort) annotated css        flag for human review; never auto-apply
```

Each candidate is **validated for uniqueness** (`matchCount === 1`) before being offered. Candidates that would match multiple elements are discarded or scoped.

### 6.3 Auto-fix safety

- Only `autoFixable` rules are applied by `testpilot fix`.
- Every fix is shown as a unified diff; `--write` required to persist; `--interactive` to approve per-change.
- Fixes preserve formatting (apply through the AST printer, not string splicing where possible).
- Concrete locator rewrites require `--dom`; without it, `fix` only does format-preserving mechanical changes (e.g. `text=` helper conversion, hard-wait flagging).

---

## 7. Education Layer

The teaching mission is a first-class output, not a footnote:

- `testpilot explain <ruleId>` prints rationale + good/bad side-by-side in the terminal.
- HTML report links every finding to its rule doc.
- Generated AI context files (see `AI-Agent-Integration.md`) embed the hierarchy so agents *write good locators in the first place* — prevention beats detection.
- Optional `--learn` mode on `analyze` adds a one-line "why this matters" under each finding for newcomers.

---

## 8. False-Positive Strategy

Linters die when they cry wolf. Mitigations:

- **Inline suppression:** `// testpilot-disable-next-line <ruleId> -- reason`. Require a reason; report unused suppressions.
- **Config severity tuning** per rule; ship conservative defaults (only unambiguous patterns are `error`).
- **Variable resolution:** when a locator arg is a non-literal variable, downgrade confidence rather than guess — emit `info`, not `error`.
- **Baseline mode** so legacy debt doesn't block adoption; only new findings gate.

---

## 9. Future AI Enhancements

Static rules and DOM heuristics get you far; an LLM extends the edges. All opt-in, isolated in `@testpilot/ai`, never required for core analysis.

| Enhancement | What it adds | Guardrail |
|---|---|---|
| **Naming-aware suggestions** | LLM proposes a *meaningful POM method name* or test-id when no accessible name exists. | Suggestion only; never auto-writes app code. |
| **Semantic dynamic-text detection** | Distinguish truly dynamic text (`Welcome, ${user}`) from stable copy beyond regex heuristics. | Confidence-scored; human-reviewed. |
| **Refactor-to-POM** | Cluster repeated locators and propose a Page Object extraction. | Diff preview, opt-in. |
| **Self-healing (V2 `heal`)** | When a locator breaks after a UI change, use DOM diff + LLM to propose the updated locator. | Requires DOM/trace; presented as a PR suggestion, not silent edits. |
| **Natural-language → locator** | Agent asks "the submit button"; TestPilot returns the resilient locator from a live DOM. | Tier-2 only; validated for uniqueness. |
| **Test intent review** | LLM critiques whether a test asserts meaningful behavior, not just presence. | Advisory output. |

**Principle:** the LLM augments a deterministic core; it never becomes a dependency of it. A user with no API key gets the full static analyzer and Tier-2 DOM analysis. The LLM only sharpens naming and self-healing — the genuinely judgment-heavy parts.

---

## 10. Determinism & Performance

- Analysis is deterministic and parallelizable per file; findings sorted by `(file, line, column)` before output → stable diffs in CI.
- AST parse is the cost driver; cache by file hash so `--changed` runs are near-instant.
- Target: < 5s to analyze a 500-test suite on a laptop (static tier).

---

## 11. Open Questions

1. Single headline score vs. always-show-the-vector — recommendation: headline + expandable sub-scores.
2. Should `getByTestId` be Tier A or Tier B? It's the most *stable* but least *accessibility-validating*. Recommendation: Tier B, and let the Accessibility sub-score carry the nuance.
3. Tier-2 DOM source priority: trace ingestion (CI-safe, recommended first) vs live-URL crawl (immediate, flakier).
4. How aggressive should default severities be? Recommendation: only XPath/nth-child/hard-wait as `error` at launch; everything else `warn`/`info` until the FP rate is measured.
