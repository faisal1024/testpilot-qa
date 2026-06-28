# TestPilot QA — GitHub Issues Backlog

> Status: Approved — aligned to *Updated Plan After Claude Review*
> A prioritized, labeled backlog organized as Epics → Stories → Tasks. Priorities map to the Roadmap (Phase 0–10 / MVP first).

> **MVP delivered (as of Milestone 4C):** the P0 MVP epics are complete and merged — repo
> foundation (1), single-template scaffolding (2) + `run`, the Tier 1 analyzer with six rules,
> scoring, and `--min-score` (3, 4), `doctor` and `explain` (6.2, 7), and the `table`/`json`
> reporters (5, P0). Items below tagged `prio:p1`+ (auto-fix, ESLint plugin, CI/SARIF, DOM tier,
> MCP, plugin ecosystem, docs portal) remain **pending** for V1+. Treat the per-epic priorities as
> the source of truth; the MVP P0 slice is done.

---

## Suggested Labels

**Type**
- `type:epic` · `type:story` · `type:task` · `type:bug` · `type:docs` · `type:spike`

**Area**
- `area:cli` · `area:scaffold` · `area:templates` · `area:locator-intel` · `area:scoring` · `area:rules` · `area:ai` · `area:reporters` · `area:eslint-plugin` · `area:mcp` · `area:ci`

**Priority**
- `prio:p0` (MVP blocker) · `prio:p1` (V1) · `prio:p2` (V2) · `prio:p3` (V3)

**Effort**
- `size:s` · `size:m` · `size:l` · `size:xl`

**Community**
- `good-first-issue` · `help-wanted` · `needs-design` · `needs-discussion`

---

## EPIC 1 — Project Foundation & Tooling `type:epic` `prio:p0`

Stand up the monorepo, CI, and conventions before feature work.

- **Story 1.1 — Monorepo bootstrap** `type:story` `area:cli` `size:m`
  - Task: pnpm workspace with `core`, `cli`, `locator-intelligence`, `scaffold`, `templates`, `ai`, `reporters` packages. `task` `size:m`
  - Task: TypeScript project references + shared tsconfig base. `task` `size:s`
  - Task: TestPilot's own test runner + coverage setup. `task` `size:s`
  - Task: CI (lint, typecheck, test, build) on PRs. `task` `area:ci` `size:s`
  - Task: Changesets-based versioning + npm publish w/ provenance. `task` `size:m`
- **Story 1.2 — Contribution & governance scaffolding** `type:story` `type:docs` `size:s` `good-first-issue`
  - Task: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue/PR templates, `LICENSE` (MIT/Apache-2.0 decision). `task`
  - Task: ADR (Architecture Decision Record) folder + first ADRs (monorepo, AST choice, Playwright-as-peer-dep). `task` `needs-design`
- **Story 1.3 — `@testpilot/core` foundations** `type:story` `area:cli` `size:l`
  - Task: shared types (`Finding`, `LocatorContext`, `Rule`, `Reporter`). `task` `size:m`
  - Task: config loader + zod schema + `defineConfig` helper. `task` `size:m`
  - Task: **internal** registry for rules/reporters/generators (not a public plugin API — see Architecture §9). `task` `size:m`
  - Task: logging + fs + error-type utilities. `task` `size:s`

---

## EPIC 2 — Project Scaffolding (`init`) `type:epic` `prio:p0` `area:scaffold`

`npx` to a passing Playwright project in under 2 minutes.

- **Story 2.1 — Template engine & manifest contract** `type:story` `area:templates` `size:l` `needs-design`
  - Task: define `manifest.json` schema (prompts, variables, post-steps, hooks). `task`
  - Task: logic-less renderer with declared hooks only (no arbitrary code). `task` `size:m`
  - Task: template resolution from built-in, npm, git, local path. `task` `size:m`
- **Story 2.2 — Built-in TypeScript template (`ui-api-fullstack`)** `type:story` `area:templates` `size:l`
  - Task: `ui-api-fullstack` — POM + fixtures + typed API client + UI example + API example. `task` `size:l`
  - Task: plain ejectable `playwright.config.ts` + environment config + sensible defaults. `task` `size:s`
  - Task *(V1)*: split into `ui-pom` / `api` / `component` packs once the single template is proven. `task` `prio:p1` `size:m`
- **Story 2.3 — `testpilot init` command** `type:story` `area:cli` `size:l`
  - Task: interactive prompts + full flag set (CLI-Spec §3.1). `task` `size:m`
  - Task: file-plan preview before write; non-destructive augment mode for existing repos. `task` `size:m`
  - Task: package-manager detection + dependency install orchestration. `task` `size:m`
  - Task: run example test post-scaffold to prove green. `task` `size:s`
- **Story 2.4 — `npm create testpilot-qa` bootstrap** `type:story` `area:cli` `size:s`

---

## EPIC 3 — Locator Intelligence: Static Core `type:epic` `prio:p0` `area:locator-intel`

The differentiator, Tier 1.

- **Story 3.1 — AST extraction** `type:story` `area:locator-intel` `size:l` `needs-design`
  - Task: integrate `@typescript-eslint/parser`; walk for Playwright locator call-sites. `task` `size:m`
  - Task: build `LocatorContext` (apiCall, engine, args, chain, sourceRef). `task` `size:l`
  - Task: handle non-literal args → confidence downgrade, not false error. `task` `size:m`
  - Task: per-file hash cache for `--changed` speed. `task` `size:s`
- **Story 3.2 — Rules engine** `type:story` `area:rules` `size:l`
  - Task: `Rule` interface + pure-function evaluation + registry. `task` `size:m`
  - Task: deterministic ordering + finding model. `task` `size:s`
  - Task: inline suppression (`// testpilot-disable-next-line`) w/ required reason + unused-suppression report. `task` `size:m`
- **Story 3.3 — Core rule set (MVP — exactly six)** `type:story` `area:rules` `size:l` `help-wanted`
  - Task: `no-xpath` `task` `size:s` `good-first-issue`
  - Task: `no-nth-child` `task` `size:s` `good-first-issue`
  - Task: `no-css-class-selector` `task` `size:m`
  - Task: `no-deep-css-chain` `task` `size:m`
  - Task: `prefer-user-facing-locator` (category guidance only — no concrete rewrite) `task` `size:m`
  - Task: `no-hard-wait` `task` `size:s` `good-first-issue`
  - Task: per-rule docs pages + `explain` entries (rationale + bad/good). `task` `type:docs` `help-wanted`
- **Story 3.4 — Additional static rules** `type:story` `prio:p1` `area:rules` `size:m`
  - Task *(V1)*: `no-id-structural-selector`, `prefer-text-helper`, `no-dynamic-text-locator`, `prefer-test-id-config`, `no-conditional-in-test`, `prefer-web-first-assertions`. `task`

---

## EPIC 4 — Scoring Model `type:epic` `prio:p0` `area:scoring`

- **Story 4.1 — Headline Locator Quality Score** `type:story` `size:m` `needs-design`
  - Task: severity-weighted, volume-normalized score (Design §4.2). `task`
  - Task: monotonicity tests (fixing never lowers score). `task` `size:s`
- **Story 4.2 — Sub-scores (V1)** `type:story` `prio:p1` `size:m`
  - Task: Resilience / Accessibility / Flakiness / Maintainability decomposition + grade bands. `task`
  - Task: PR delta reporting + `--baseline`. `task` `size:m`

---

## EPIC 5 — Reporters & CLI Output `type:epic` `prio:p0` `area:reporters`

- **Story 5.1 — Output contract** `type:story` `size:m`
  - Task: versioned `--json` envelope (CLI-Spec §5). `task` `size:s`
  - Task: documented exit codes. `task` `size:s`
- **Story 5.2 — Reporters** `type:story` `size:m`
  - Task: `table` (TTY) `task` `size:s` · `json` `task` `size:s`
  - Task: `html` report `task` `prio:p1` `size:m`
  - Task: `sarif` for GitHub code scanning `task` `prio:p1` `size:m`
- **Story 5.3 — `analyze` command + gates** `type:story` `area:cli` `size:m`
  - Task: globs, `--reporter`, `--min-score`, `--severity`, `--changed`. `task`

---

## EPIC 6 — AI Agent Integration `type:epic` `area:ai`

- **Story 6.1 — Canonical guidance + generators (MVP, used by `init`)** `type:story` `prio:p0` `size:l` `needs-design`
  - Task: single-source `testpilot/agent-guidance.md` schema/content. `task` `size:m`
  - Task: `ContextGenerator` **internal** interface. `task` `size:s`
  - Task: generators — `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, `.cursor/rules/*.mdc`. `task` `size:l`
  - Task: generated-file markers (drift *detection* lands with `doctor`, Epic 7). `task` `size:s`
- **Story 6.2 — `testpilot explain` (education surface, MVP)** `type:story` `prio:p0` `area:cli` `size:s`
- **Story 6.3 — `testpilot add ai` + drift polish** `type:story` `prio:p1` `area:cli` `size:m`
  - Task *(V1)*: standalone regeneration command + full drift reconciliation. `task`
- **Story 6.4 — TestPilot MCP server** `type:story` `prio:p2` `area:mcp` `size:l` `needs-design`
  - Task *(V2)*: `analyze_tests`, `explain_rule`, `suggest_locator`, `score_project` tools. `task`

---

## EPIC 7 — Diagnostics `type:epic` `prio:p0` `area:cli`

- **Story 7.1 — `testpilot doctor`** `type:story` `size:m`
  - Task: Node/Playwright version-range check (Playwright as peer dep). `task` `size:s`
  - Task: config validity + AI-file drift + fragile-file hotspots. `task` `size:m`

---

## EPIC 8 — Auto-Fix `type:epic` `prio:p1` `area:locator-intel`

- **Story 8.1 — `testpilot fix`** `type:story` `size:l` `needs-design`
  - Task: AST-based, format-preserving rewrites for `autoFixable` rules. `task` `size:l`
  - Task: dry-run diff default; `--write`; `--interactive`. `task` `size:m`
  - Task: safety tests (idempotency, no semantic change). `task` `size:m`

---

## EPIC 9 — ESLint Plugin `type:epic` `prio:p1` `area:eslint-plugin`

- **Story 9.1 — `eslint-plugin-testpilot`** `type:story` `size:l`
  - Task: adapter exposing locator rules as ESLint rules (reuse rule logic). `task` `size:l`
  - Task: shared/recommended config preset. `task` `size:s`
  - Task: editor-feedback docs. `task` `type:docs`

---

## EPIC 10 — CI Integration `type:epic` `prio:p1` `area:ci`

- **Story 10.1 — GitHub Action** `type:story` `size:m`
  - Task: action wrapping the programmatic API; SARIF upload. `task`
  - Task: `testpilot review` PR annotations. `task` `size:m`
- **Story 10.2 — `baseline` + `--changed` adoption flow** `type:story` `size:m`

---

## EPIC 11 — Tier 2 DOM-Aware Intelligence `type:epic` `prio:p2` `area:locator-intel`

- **Story 11.1 — DOM context ingestion** `type:story` `size:xl` `needs-design`
  - Task: parse Playwright trace/DOM snapshot → `LocatorContext.dom`. `task` `size:l`
- **Story 11.2 — DOM-aware rules + concrete suggestions** `type:story` `size:xl`
  - Task: `suggest-concrete-locator` w/ uniqueness validation. `task` `size:l`
  - Task: `non-unique-locator`, `locator-missing-accessible-name`. `task` `size:m`
  - Task: `fix --dom` concrete rewrites. `task` `size:m`
- **Story 11.3 — `testpilot heal`** `type:story` `size:l`
- **Story 11.4 — `testpilot record` (codegen post-processing)** `type:story` `size:l`

---

## EPIC 12 — Ecosystem & Extensibility `type:epic` `prio:p2`

- **Story 12.1 — Third-party rule-pack contract** `type:story` `area:rules` `size:m` `help-wanted`
- **Story 12.2 — Community language template packs** `type:story` `prio:p3` `area:templates` `size:xl` `help-wanted`
- **Story 12.3 — Reporter plugin interface** `type:story` `area:reporters` `size:s`

---

## EPIC 13 — Trend & Scale `type:epic` `prio:p3`

- **Story 13.1 — `testpilot dashboard` (local trends)** `type:story` `size:xl` `needs-design`
- **Story 13.2 — `testpilot migrate` (Cypress/Selenium codemod)** `type:story` `size:xl`
- **Story 13.3 — `testpilot agent` batch endpoint** `type:story` `area:ai` `size:l`

---

## EPIC 14 — Documentation Portal (Docusaurus) `type:epic` `prio:p1` `type:docs`

> Built **after** the core is usable (Roadmap Phase 7) so it doesn't go stale. MVP relies on
> in-repo markdown + per-rule docs pages, not a portal.

- **Story 14.1 — Docusaurus site** `type:story` `size:l`
  - Task: Getting Started, Installation, CLI Commands, Locator Intelligence, Rule Catalog, API Testing, AI Agent Integration, CI/CD, Troubleshooting, FAQ, Roadmap, Contributing. `task`

---

## Suggested First Milestone (MVP cut line)

**Ship MVP =** Epics **1, 2 (single `ui-api-fullstack` template), 3 (six rules), 4 (Story 4.1 score),
5 (P0 reporters: `table`/`json`), 6 (Stories 6.1–6.2: canonical generation + `explain`), 7 (`doctor`)**.
MVP command surface: `init`, `analyze`, `doctor`, `explain`.

**Defer to V1+:** auto-fix (8), ESLint plugin (9), CI/SARIF/baseline (10), `add ai` polish (6.3),
docs portal (14); **V2:** DOM tier (11), MCP (6.4), public plugin ecosystem (12); **V3:** scale (13).

---

## Recommended Issue Hygiene

- Every rule issue must include: a **bad example**, the **expected finding**, and the **good replacement** — so it's testable and `good-first-issue`-friendly.
- Tag anything touching the scoring formula, manifest schema, or `LocatorContext` with `needs-design` — these are the load-bearing contracts; change them deliberately.
- Track FP reports against rules as `type:bug area:rules`; an FP in a `error`-severity rule is a P0.
