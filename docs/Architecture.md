# TestPilot QA — Architecture

> Status: Approved — aligned to *Updated Plan After Claude Review*
> Audience: Maintainers, contributors, AI coding agents
> Scope: System architecture, components, package boundaries, dependency & extension strategy

> **Alignment note (approved plan):** MVP ships **one** template (`ui-api-fullstack`), the
> MVP command set is `init` / `run` / `analyze` / `doctor` / `explain` (`init` + `run` implemented in
> Milestone 2.5; `run` is a thin Playwright pass-through), rules/reporters/generators are
> **simple internal interfaces** (no public plugin system yet), and `fix`, the ESLint plugin, MCP,
> DOM-aware suggestions, and the docs portal are explicitly deferred. See §2 and `Roadmap.md`.

---

## 1. What TestPilot QA Is (and Is Not)

**TestPilot QA is a developer-experience layer and project accelerator for Playwright.**

It does three distinct jobs:

1. **Scaffold** maintainable Playwright automation projects (UI + API) from opinionated templates.
2. **Analyze** existing Playwright code for fragile locators and anti-patterns (*Locator Intelligence*).
3. **Integrate** with AI coding agents by generating and maintaining agent-context files.

It is **not** a test runner, **not** an assertion library, and **not** a Playwright fork. Playwright remains the execution engine, the assertion library, and the browser-automation API. TestPilot never wraps `page` in a way that hides Playwright's API — that would create a leaky abstraction that ages badly.

### Design tenet: thin, removable, honest

A user must be able to delete TestPilot from a project and still have a working Playwright suite. Everything TestPilot generates is **ejectable** plain Playwright. The accelerator's value is in *getting you to good Playwright faster* and *keeping it good*, not in lock-in.

---

## 2. Challenged Assumptions (read this first)

You asked me to push back. Here are the assumptions in the brief I'd reconsider, with recommendations.

### 2.1 "Locator Intelligence" — static analysis alone is not enough

**Your assumption:** Analyze tests, flag bad selectors, recommend `getByRole()` etc.

**The hard truth:** A static analyzer can confidently say *"`.btn-primary` is a CSS class selector — fragile"*. It **cannot** confidently say *"use `getByRole('button', { name: 'Save' })` instead"* because it doesn't know the DOM. The accessible name, the role, whether a `data-testid` exists — none of that is in the test file. It's in the application.

**Recommendation — a two-tier model:**

- **Tier 1 (MVP) — Static analysis.** AST-based detection + scoring of *known-bad patterns*. Output: "this selector is fragile, here is the *category* of better approach, here's the rule explaining why." High precision on detection, generic on the fix.
- **Tier 2 (V1+) — DOM-aware suggestions.** Optionally consume a Playwright **trace**, **DOM snapshot**, or run against a live URL to produce *concrete* rewrites (`getByRole('button', { name: 'Save' })`). This is the genuinely differentiated capability — and the part competitors don't have.

Ship Tier 1 first. Architect for Tier 2 from day one (see §6, the `LocatorContext` abstraction). Don't market DOM-aware suggestions until they exist.

### 2.2 You may be reinventing two existing tools — differentiate sharply

- **`eslint-plugin-playwright`** already lints Playwright tests (some locator rules included).
- **Playwright Codegen / "Pick locator"** already suggests role-based locators *with* DOM context.

**Recommendation:** Don't compete on "we have a linter." Differentiate on:
- **Scoring + education** (a *Locator Quality Score* with explanations, not just pass/fail).
- **Project-wide reporting** (a flakiness/quality dashboard across the suite, trendable in CI).
- **AI-agent-native output** (structured JSON findings an agent can auto-fix).
- **Scaffolding** that produces a suite that's good *by construction*.

Plan to **ship the rules engine as an ESLint plugin too** (`eslint-plugin-testpilot`) so users get inline editor feedback for free, while the CLI provides scoring, reporting, and bulk fixes. Per the approved plan this is a **V1 enhancement**, not MVP — but the rules engine is architected from day one so the plugin is a thin adapter, not a rewrite. Reuse, don't reinvent, the AST tooling (`@typescript-eslint/parser`).

### 2.3 "Future support for additional languages" — defer hard

Playwright has first-class Python, Java, and .NET bindings, and the temptation to template all of them is real. But:
- The locator anti-patterns differ per language and per binding idiom.
- Maintaining N language template sets multiplies surface area before you have adoption.

**Recommendation:** TypeScript-first, and make it *excellent*. Treat other languages as **template packs** behind a stable template contract (§7), contributed by the community in V2+, not a core maintainer commitment. Document the contract early so the door is open; don't walk through it yourself yet.

### 2.4 Scope creep risk — three products in one repo

Scaffolding, static analysis, and AI-file generation are three different concerns with three different release cadences. Keep them as **separate packages in one monorepo** (§4) so they can version independently and so a user who only wants the analyzer doesn't pull in template machinery.

### 2.5 "Reduce flaky tests" is broader than locators

Flakiness comes from locators, *but also* from: missing auto-wait usage, `waitForTimeout` hard sleeps, test interdependence, shared state, and unmocked network. Frame Locator Intelligence as the **first** of a family of **Health Rules** (§6.3), not the whole flakiness story. This keeps the scoring model extensible.

---

## 3. Architectural Goals & Quality Attributes

| Attribute | Target |
|---|---|
| **Time-to-first-test** | `< 2 minutes` from `npx` to a passing example test. |
| **Zero lock-in** | Generated output is plain, ejectable Playwright. |
| **Determinism** | Same input → same analysis output (CI-friendly, diffable). |
| **Machine-readable** | Every analysis emits JSON; human formats are derived from it. |
| **Extensibility** | Rules and templates are plugins, not core edits. |
| **Low dependency weight** | Few, well-chosen runtime deps; lean install. |
| **Offline-first** | Core analysis & scaffolding never require network or an LLM. AI is opt-in enhancement. |

---

## 4. System Architecture

### 4.1 High-level view

```
┌───────────────────────────────────────────────────────────────┐
│                          User surfaces                          │
│   CLI  •  ESLint plugin  •  CI reporter  •  AI coding agents     │
└───────────────┬───────────────────────────────┬────────────────┘
                │                               │
        ┌───────▼────────┐             ┌────────▼─────────┐
        │  @testpilot/cli │             │ eslint-plugin-   │
        │ (command layer) │             │   testpilot      │
        └───────┬────────┘             └────────┬─────────┘
                │  orchestrates                 │ reuses rules
   ┌────────────┼───────────────┬───────────────┘
   │            │               │
┌──▼───────┐ ┌──▼────────────┐ ┌▼──────────────────┐ ┌──────────────┐
│ scaffold │ │  locator-     │ │  ai (context-file │ │  reporters   │
│(templates)│ │ intelligence  │ │   generators)     │ │ (json/html/  │
│          │ │ (rules+score) │ │                   │ │  sarif)      │
└──────────┘ └───────┬───────┘ └───────────────────┘ └──────────────┘
                     │ depends on
                ┌────▼─────┐
                │   core   │  (types, config, fs, logging, AST utils)
                └──────────┘
```

### 4.2 Runtime flow — `analyze`

```
test files ──► parse (AST) ──► extract locator call-sites ──► LocatorContext
                                                                   │
                              ┌────────────────────────────────────┘
                              ▼
                        Rules Engine ──► Findings[] ──► Scorer ──► Report
                              │                                      │
                        (static rules)                       json / html / sarif
                              │
                  (optional) DOM/trace context ──► concrete-suggestion rules
```

### 4.3 Runtime flow — `init` / `scaffold`

```
prompts / flags ──► resolve template pack ──► render (template engine)
                                                   │
                              ┌────────────────────┘
                              ▼
                  write files ──► install deps ──► run example test ──► generate AI context files
```

---

## 5. Major Components

| Component | Package | Responsibility | Depends on |
|---|---|---|---|
| **CLI** | `@testpilot/cli` | Argument parsing, command orchestration, human output. Thin. | core, all feature pkgs |
| **Core** | `@testpilot/core` | Config loading/validation, shared types, AST helpers, file IO, logging, plugin loader. | (leaf — minimal deps) |
| **Locator Intelligence** | `@testpilot/locator-intelligence` | Rules engine, scoring model, finding model, suggestion generation. | core |
| **Scaffolding** | `@testpilot/scaffold` | Template resolution + rendering, dependency install orchestration. | core, templates |
| **Templates** | `@testpilot/templates` | The actual project blueprints (POM, API client, fixtures, CI). | (data + manifest) |
| **AI Integration** | `@testpilot/ai` | Generators for `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, `.cursor/rules`. | core |
| **Reporters** | `@testpilot/reporters` | Render Findings/Score into json, table (MVP); html, SARIF (V1). | core |
| **ESLint plugin** *(V1)* | `eslint-plugin-testpilot` | Surfaces a subset of rules inline in the editor. | locator-intelligence |

**Why this split:** each package has a single reason to change. The analyzer can ship weekly with new rules; templates change slowly; AI generators change when agent ecosystems change. The CLI is a thin orchestration shell with no business logic, which keeps it testable and keeps logic reusable from non-CLI surfaces (ESLint, programmatic API, future GitHub Action).

---

## 6. Locator Intelligence — architecture (design detail in `Locator-Intelligence-Design.md`)

### 6.1 The `LocatorContext` abstraction (the key extension seam)

Every rule receives a `LocatorContext`, not a raw string. This is what lets the same rules engine work statically *and* with DOM data later:

```
LocatorContext {
  raw: string              // the selector/locator expression as written
  apiCall: 'locator' | 'getByRole' | 'getByTestId' | 'xpath' | ...
  args: ParsedArgs         // structured args from the AST
  sourceRef: { file, line, column }
  dom?: DomContext         // OPTIONAL — present only in Tier 2 (trace/live)
}
```

Static rules read `raw`, `apiCall`, `args`. DOM-aware rules additionally read `dom`. Rules **declare** whether they require DOM context; the engine skips DOM-requiring rules when `dom` is absent. This is the single most important architectural decision in the analyzer — it future-proofs the whole feature.

### 6.2 Rules engine

- Rules are **pure functions**: `(LocatorContext, RuleConfig) => Finding | null`.
- Each rule has: `id`, `category`, `severity`, `requiresDom`, `docsUrl`, `description`.
- Rules are **registered**, not hard-coded — third parties add rules via the plugin loader.
- The engine is **deterministic** and **order-independent** (findings sorted by source position before output).

### 6.3 Beyond locators — Health Rules

The same engine hosts non-locator rules (`no-hard-wait`, `no-conditional-in-test`, `prefer-web-first-assertions`). Locator rules are the launch category; the architecture treats them as one category among several so the scoring model and reporters don't need to change as the rule set grows.

### 6.4 Scoring

A `Scorer` aggregates findings into a **Locator Quality Score** (0–100) per file and per project, weighted by severity and locator volume. Designed to be **trended in CI** (a number that goes up). Full model in the design doc.

---

## 7. Templates — the contract

Templates are **data**, not code paths. A template pack is a directory with a manifest:

```
template-pack/
  manifest.json        # id, name, language, prompts, variables, post-steps
  files/               # rendered with a logic-less template engine
  hooks/               # optional: postInstall, postScaffold
```

**Rules:**
- The renderer is **logic-less** (no arbitrary code execution in templates beyond declared hooks).
- A stable `manifest.json` schema is the contract that lets community language packs exist without core changes.
- **MVP ships exactly one built-in pack: `ui-api-fullstack`** (TypeScript) — a single strong template that covers UI + API in one project. Splitting into smaller packs (`ui-pom`, `api`, `component`) and any third-party/community packs are deferred to V1+.
- For MVP the manifest contract is **internal** (consumed only by the built-in pack). It is *designed* to become public later, but is not a supported extension point yet.

This keeps "future languages/packs via templates" cheap *later* without paying for the abstraction *now* — per the approved plan's "no complex plugin system beyond simple internal interfaces."

---

## 8. Dependency Strategy

**Principles:**
1. **Playwright is a peer dependency**, never a bundled/forwarded one. TestPilot must track the user's Playwright version, not pin its own. Templates declare a supported range.
2. **Lean runtime deps.** Prefer the platform: Node's `fs`, `util.parseArgs` or a single small arg parser. Reuse `@typescript-eslint/parser` for AST rather than writing one.
3. **No LLM SDK in core.** AI features are optional and isolated in `@testpilot/ai`; the analyzer and scaffolder work fully offline. Any LLM call is opt-in, behind a flag, with a clear network-egress notice.
4. **Dev-dependency discipline.** Heavy tooling (the test runner for TestPilot's own suite, bundler) stays in dev deps.
5. **Supply-chain hygiene.** Lockfile committed, `provenance` on publish, Dependabot/Renovate, minimal transitive surface. This is a *QA* tool — its own supply chain is part of its credibility.

**Candidate stack (recommendation, open for debate):**

| Concern | Recommendation | Why |
|---|---|---|
| Language | TypeScript | Type-safe rule/finding models; matches audience. |
| Runtime | Node ≥ 20 LTS | Matches Playwright's baseline. |
| Monorepo | pnpm workspaces | Fast, strict, good for many small packages. |
| AST | `@typescript-eslint/parser` | Don't write a parser; reuse the ecosystem standard. |
| CLI parsing | small lib (`commander`/`cac`) or `node:util parseArgs` | Keep it light. |
| Schema validation | `zod` | Config + manifest validation, great DX, single dep. |
| Output formats | hand-rolled + SARIF schema | SARIF makes findings render natively in GitHub code scanning. |

---

## 9. Extension Strategy

> **Approved-plan constraint:** MVP has **no public plugin system**. The four seams below exist
> as **simple internal interfaces** so the codebase stays modular and testable; they are *not*
> documented, versioned, or supported as third-party extension points until V2. We design the
> interfaces cleanly now and open them deliberately later — opening a plugin API is a one-way door.

The four internal seams (and when each becomes a *public* extension point):

| Seam | Internal interface (MVP) | Public extension point |
|---|---|---|
| **Rules** | `Rule` registered in an internal registry; only built-in rules. | V2 — third-party rule packs (`testpilot-rules-*`). |
| **Templates** | `manifest.json` consumed by the one built-in pack. | V1+ — split built-ins; V2 — community/language packs. |
| **Reporters** | `Reporter` interface; built-in `table`/`json`. | V1 — `html`/`sarif`; V2 — third-party reporters. |
| **AI generators** | `ContextGenerator` interface; built-in agent files. | V1 — `add ai` regeneration; later — new agent formats. |

Config (`testpilot.config.ts`) is the single composition root. In MVP it configures **built-in**
rules, scoring, and AI agents only (validated by zod, typed for autocomplete). Wiring in
*external* rules/templates/reporters arrives with the public plugin API in V2.

---

## 10. Programmatic API

Everything the CLI does is available as a library (`@testpilot/locator-intelligence`, `@testpilot/scaffold`). This matters for:
- **CI integrations** that want findings as objects, not parsed stdout.
- **AI agents** that call the analyzer and act on structured results.
- **The future GitHub Action** (V1) which is a thin wrapper over the programmatic API.

Stdout text is a *rendering* of the API's return value, never the source of truth.

---

## 11. Open Questions for Maintainers

1. ~~Ship the ESLint plugin in V1 or defer?~~ **Resolved (approved plan):** V1, after static analysis is proven. The rules engine is built to make the plugin a thin adapter.
2. Is the Locator Quality Score a single number or a small vector (fragility, accessibility, maintainability)? A single headline number plus sub-scores is my recommendation.
3. Trace ingestion vs live-URL crawling for Tier 2 DOM context — which first? (Trace ingestion is safer and CI-friendly; live crawling is more immediate but flakier.)
4. Do we own a hosted dashboard (V3) or stay strictly local + CI artifacts? Staying local longer keeps the project trustworthy and contribution-friendly.

---

## 12. Glossary

- **Finding** — a single rule violation at a source location.
- **LocatorContext** — normalized input to a rule (static, optionally DOM-enriched).
- **Locator Quality Score** — 0–100 aggregate health metric.
- **Template pack** — a versioned, manifest-described project blueprint.
- **Tier 1 / Tier 2** — static-only vs DOM-aware analysis.
- **Eject** — convert TestPilot-managed config into plain Playwright the user owns outright.
