# TestPilot QA — Roadmap

> Status: Approved — aligned to *Updated Plan After Claude Review*
> This roadmap adopts the approved **Phase 0–10** structure and maps each phase to a release version.

---

## Guiding Strategy

1. **Earn trust before adding magic.** Ship deterministic, offline, high-precision tooling first. LLM, auto-fix, and self-healing come *after* the static core is credible.
2. **Adoption over surface area.** One excellent TypeScript path and **one strong template** beat many shallow ones. Defer multi-language and multi-template until the contract and community exist.
3. **No premature plugin system.** Internal interfaces only until V2; opening a public plugin API is a one-way door.
4. **Every release is portfolio-grade.** Docs, tests, CI, and examples are part of "done" — but the **docs *portal*** is built after the core is usable, not before.
5. **Differentiate, don't duplicate.** Build on `@typescript-eslint/parser` and Playwright codegen; spend novel effort on **scoring, education, DOM-aware suggestions, and agent-native output**.

---

## Phase → Version Map

| Phase | Theme | Version |
|---|---|---|
| 0 | Discovery review | — (done) |
| 1 | Foundation & CLI shell | **MVP** |
| 2 | Project scaffolding MVP (one template) | **MVP** |
| 3 | Locator Intelligence Tier 1 (6 rules + score) | **MVP** |
| 4 | `doctor` & `explain` | **MVP** |
| 5 | CI & brownfield adoption | **V1** |
| 6 | AI-agent integration (full) | **V1** |
| 7 | Documentation portal (Docusaurus) | **V1** (after Phase 4–5) |
| 8 | V1 enhancements (ESLint plugin, html, `fix`, more rules) | **V1** |
| 9 | V2 differentiators (DOM-aware, `record`, MCP) | **V2** |
| 10 | Future exploration (LLM, Python/Ruby packs) | **V3 / future** |

---

## Phase 0 — Discovery Review  *(done)*

Six discovery documents produced and reviewed; approved with simplifications (single template, internal interfaces, deferred `fix`/MCP/DOM/docs-portal). This roadmap reflects that decision.

---

## MVP — Phases 1–4

The credible core: scaffold a great project, detect the worst locators reliably, diagnose and educate. **Offline. No LLM. No auto-fix. No MCP. No DOM tier. One template.**

### Phase 1 — Foundation & CLI Shell  *(Milestones 1–2)*
- pnpm workspace; TypeScript config; package boundaries (`core`, `cli`, `locator-intelligence`, `scaffold`, `templates`, `ai`, `reporters`).
- lint / typecheck / test / build scripts; CI on PRs; release tooling.
- CLI shell: `testpilot --help`, `testpilot --version`, global options.
- **Empty/placeholder command handlers** for `init`, `analyze`, `doctor`, `explain`.
- Config loading (`testpilot.config.ts` + zod) wired but minimal.
- *Not built:* `fix`, `heal`, MCP, DOM-aware suggestions, docs portal, AI generation.

### Phase 2 — Project Scaffolding MVP  *(Milestone 2.5)*
- `testpilot init` with **one** `ui-api-fullstack` TypeScript template.
- UI example test + API example test + `playwright.config.ts` + `testpilot.config.ts`.
- GitHub Actions template + README template; overwrite protection (`--force`).
- **`testpilot run`** — a thin Playwright pass-through (convenience wrapper, **not** a custom
  runner). Locates the project, finds the Playwright config, forwards args after `--`, preserves
  Playwright's exit code. Reconciles the original "early `run`" idea without architectural debt.
- Generated AI guidance files from one canonical source — *deferred to a later milestone*.
- **Success:** `npx testpilot-qa init demo --yes` → `npx playwright test` passes (verified: UI + API
  example tests green) → output is plain/ejectable Playwright; `testpilot run` delegates to it.

### Phase 3 — Locator Intelligence Tier 1  *(Milestones 4–5)*
- AST-based locator extraction; `LocatorContext` model; rules engine.
- **Six static rules:** `no-xpath`, `no-nth-child`, `no-css-class-selector`, `no-deep-css-chain`, `prefer-user-facing-locator`, `no-hard-wait`.
- `table` + `json` output.
- **Locator Quality Score** + sub-scores: Resilience, Accessibility, Maintainability, Flakiness.
- **Constraint:** no fake concrete suggestions — category-level guidance only ("prefer `getByRole`/`getByLabel`/`getByTestId` where possible"), never `getByRole('button', { name: 'Save' })` without DOM context.

### Phase 4 — Doctor & Explain  *(MVP polish)*
- `testpilot doctor`: Node version, Playwright dependency, config validity, test directory, AI guidance-file drift.
- `testpilot explain <ruleId>`: rationale, bad example, better example, docs link.

---

## V1 — Phases 5–8

Make it part of the everyday loop, the CI pipeline, and the agent ecosystem; then the docs portal and enhancements.

### Phase 5 — CI & Brownfield Adoption
- SARIF reporter; `--min-score`; `--changed`; baseline support; official GitHub Action; PR-friendly output.
- *Why early in V1:* most teams adopt in an **existing** repo, not from a clean scaffold.

### Phase 6 — AI-Agent Integration (full)
- Canonical `testpilot/agent-guidance.md` as the single source.
- Generated `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, Cursor rules.
- Drift detection in `doctor`; `testpilot add ai`.
- **No LLM calls** — this is agent *readiness*, not AI-generated tests.

### Phase 7 — Documentation Portal (Docusaurus)
- Built **after** Phases 4–5 so it doesn't go stale: Getting Started, Installation, CLI Commands, Locator Intelligence, Rule Catalog, API Testing, AI Agent Integration, CI/CD, Troubleshooting, FAQ, Roadmap, Contributing.

### Phase 8 — V1 Enhancements
- `eslint-plugin-testpilot` (inline editor feedback); HTML report; **`fix`** (dry-run by default, after static analysis is proven); more rule coverage; stronger Health Score reporting.

---

## V2 — Phase 9 — Differentiators

- **Tier 2 DOM-aware analysis** from Playwright traces or live URL.
- Concrete, validated locator suggestions; locator uniqueness checks.
- `testpilot record` (wrapper around `playwright codegen`).
- Possible **MCP server** (`analyze_tests`, `explain_rule`, `suggest_locator`, `score_project`).
- Public plugin contracts open here: third-party rule packs, additional template/language packs (reference Python pack), reporter plugins.

---

## V3 / Future — Phase 10

Only after adoption: AI failure analysis, AI locator repair, AI test-skeleton generation, Python/Ruby template packs, documentation playground, and (decision point) an optional trend dashboard — only if it preserves the local-first, trustworthy posture.

---

## Changes vs. the Original Discovery Roadmap (and why)

| Change | Rationale |
|---|---|
| **One `ui-api-fullstack` template in MVP** (was four) | Less surface area; prove the scaffolding story with one strong template, split later if needed. |
| **`explain` moved into MVP** (was V1) | Cheap, high-value education surface; pairs naturally with Tier 1 rules. |
| **MVP rule set fixed at six** (renamed `prefer-user-facing-locator`, `no-deep-css-chain`) | Matches approved scope; remaining rules deferred to V1. |
| **No public plugin system in MVP** | Approved "simple internal interfaces only"; avoids a premature one-way-door API. |
| **Docs *portal* deferred to V1 (Phase 7)** | A portal built too early goes stale; ship docs-as-markdown + per-rule pages first. |
| **`fix` explicitly deferred until after analyze is proven** | Mutating user test code is a trust event; earn detection precision first. |
| **MCP firmly in V2** | Higher-maintenance surface; static context files suffice for agent readiness in V1. |

---

## Non-Goals (every version)

- Not a test runner, assertion library, or Playwright fork.
- No mandatory cloud, account, or API key for core features.
- No silent edits to user code or app code.
- No lock-in — generated output is always ejectable plain Playwright.
