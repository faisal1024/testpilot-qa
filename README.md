# TestPilot QA

> A developer-experience layer and project accelerator for **Playwright**.
> Not a test framework. Not a Playwright replacement. A toolkit that gets you to *good* Playwright faster — and keeps it good.

TestPilot QA does three jobs:

1. **Scaffold** maintainable Playwright UI + API projects from opinionated templates.
2. **Analyze** existing tests for fragile locators and flaky patterns — *Locator Intelligence*.
3. **Integrate** with AI coding agents (Claude Code, Codex, Cursor, Copilot) so they write good Playwright by default.

Everything it generates is **ejectable plain Playwright** — zero lock-in.

---

## Quick start

```bash
# Scaffold a TypeScript Playwright project (UI + API examples + AI agent guidance)
npx testpilot-qa init demo --yes
cd demo

# Install Playwright and run the generated tests
npm install
npx playwright install
npx playwright test          # plain Playwright — always works

# Generated npm scripts (plain Playwright)
npm run test:e2e             # all tests
npm run test:e2e:ui          # UI tests only
npm run test:e2e:api         # API tests only
npm run test:e2e:parallel    # run with 2 workers

# …or run through TestPilot (a thin pass-through around Playwright)
npx testpilot-qa run
npx testpilot-qa run -- --workers=2
npx testpilot-qa run -- tests/ui --workers=2
```

`testpilot run` is a convenience wrapper, **not** a custom runner: it locates your project,
finds the Playwright config, and forwards to your local Playwright, preserving its exit code.
Parallelism is **Playwright's** (`fullyParallel: true` + `--workers`), not TestPilot's — any
Playwright flag passes straight through after `--`. The generated sample tests are independent and
parallel-safe by design. Delete `testpilot.config.ts` and the `testpilot-qa` dependency and you
still have a working Playwright suite.

```bash
# Analyze locator quality in your existing tests (read-only)
npx testpilot-qa analyze
npx testpilot-qa analyze --json

# Gate CI on a minimum Locator Quality Score (non-zero exit if below)
npx testpilot-qa analyze --min-score 80

# Write the JSON report to a file (instead of stdout)
npx testpilot-qa analyze --output testpilot-report.json
```

**Brownfield baseline.** Adopting on an existing suite with known issues? Record a baseline once,
then gate CI on *new* findings only — exit non-zero only when a regression is introduced, while the
pre-existing findings are grandfathered in.

```bash
# Record the current findings as the accepted baseline
npx testpilot-qa analyze --baseline testpilot-baseline.json --update-baseline

# In CI: fail only when a NEW finding appears (exit 1), ignore baselined ones
npx testpilot-qa analyze --baseline testpilot-baseline.json
```

A finding's baseline identity is its rule + file + code snippet — independent of line number,
severity, and whitespace (indentation, tabs, and repeated spaces are normalized) — so moving code
around or re-grading a rule never resurfaces an already-accepted finding. Distinct selector text stays
distinct (`getByText('Log in')` ≠ `getByText('Login')`), so a genuinely new finding is never silently
grandfathered in. Commit the baseline file and shrink it over time as you fix the debt.

`analyze` statically flags fragile locators with the MVP Tier 1 rules — `no-xpath`,
`no-css-class-selector`, `no-nth-child`, `no-deep-css-chain`, `prefer-user-facing-locator`, and
`no-hard-wait` — as a human table or stable JSON. Severity is configurable per rule (`off` disables).

Every run computes a deterministic **Locator Quality Score** (0–100, graded A–F) with Resilience,
Accessibility, Maintainability, and Flakiness sub-scores. Without `--min-score` it's reporting-only
(exit 0); with `--min-score <n>` (or `scoring.minScore` in config — the flag wins) it exits non-zero
when the score is below the threshold. Scoring is static (Tier 1), not DOM-aware.

```bash
# Understand any rule: why it matters, examples, and guidance
npx testpilot-qa explain no-xpath
npx testpilot-qa explain no-hard-wait --json

# Diagnose project readiness and common setup issues
npx testpilot-qa doctor
npx testpilot-qa doctor --json
```

`doctor` checks Node version, `package.json`, a local Playwright install, Playwright/TestPilot
config validity, the test directory, project structure, and **AI guidance-file drift** (missing /
user-edited / stale per selected agent) — printing a pass/warn/fail report with remediation. It's
read-only and offline; exit codes are CI-friendly (`0` healthy, `3` invalid config, `4` setup
problems). Guidance drift is a **warning only** — it never fails the command on its own.

### AI agent guidance

`init` also generates agent-context files from a **single canonical guidance source** (offline, no
LLM): `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, and
`.cursor/rules/testpilot-playwright.mdc`. They teach agents the locator hierarchy, web-first
assertions, no-hard-waits, API conventions, and the TestPilot commands — and stay honest about Tier
1 limits (no DOM-aware suggestions). Each carries a `version + sha256` marker for future drift
detection. Existing files are never overwritten without `--force`.

**Available today (all five MVP commands):** `init` (scaffold + AI guidance), `run` (Playwright
pass-through), `analyze` (static Locator Intelligence), `doctor` (project diagnostics), and `explain`
(rule education).

---

## Documentation

The design and planning docs (the alpha is implemented; these capture the architecture and
sequencing). Start here:

| Document | What it covers |
|---|---|
| [Architecture](docs/Architecture.md) | System architecture, components, package boundaries, dependency & extension strategy — plus **challenged assumptions**. |
| [CLI Spec](docs/CLI-Spec.md) | Commands, arguments, examples, exit codes, future command roadmap. |
| [Locator Intelligence Design](docs/Locator-Intelligence-Design.md) | Locator hierarchy, rules engine, scoring model, suggestions, future AI enhancements. |
| [AI Agent Integration](docs/AI-Agent-Integration.md) | Claude/Codex/Cursor/Copilot support, single-source guidance, MCP, recommended repo structure. |
| [Roadmap](docs/Roadmap.md) | MVP → V1 → V2 → V3, with sequencing rationale. |
| [Adoption Plan](docs/Adoption-Plan.md) | Public-alpha readiness, brownfield adoption, CI surfaces, and sequencing tradeoffs. |
| [GitHub Issues](docs/GitHub-Issues.md) | Prioritized backlog: Epics → Stories → Tasks, with suggested labels. |

---

## The Locator Quality Hierarchy (the core idea)

| Tier | Prefer | Avoid |
|---|---|---|
| A | `getByRole` · `getByLabel` · `getByPlaceholder` · `getByText` | — |
| B | `getByTestId` | — |
| C | — | raw CSS / `text=` engine strings, chained `nth()` |
| D | — | **XPath**, `:nth-child`, class/id structural selectors |

```ts
// ❌ fragile
page.locator('.btn-primary')
page.locator('#container > div > button:nth-child(3)')

// ✅ resilient
page.getByRole('button', { name: 'Save' })
page.getByLabel('Email')
```

---

## Key Architectural Decisions (and pushback on the brief)

- **Two-tier Locator Intelligence.** Static AST analysis ships first (detect + educate); **DOM-aware concrete suggestions** (`getByRole('button', { name: 'Save' })`) come in V2 once they can be validated. Never present a static guess as a DOM-backed fact.
- **Reuse, don't reinvent.** Build on `@typescript-eslint/parser`; an `eslint-plugin-testpilot` follows in **V1** (the rules engine is built to make it a thin adapter) rather than competing with the linter ecosystem.
- **One guidance source, many agent files.** `CLAUDE.md` / `AGENTS.md` / Copilot / Cursor files are *generated* from a single canonical source to prevent drift.
- **TypeScript-first.** Other languages arrive later as community **template packs** behind a stable manifest contract — not a day-one maintainer commitment.
- **Offline by default.** The analyzer and scaffolder need no network and no API key; LLM features are opt-in and isolated.

See [Architecture §2](docs/Architecture.md) for the full set of challenged assumptions.

---

## Approved MVP scope

Per the *Updated Plan After Claude Review*, the MVP is deliberately narrow:

- **Commands:** `init`, `run`, `analyze`, `doctor`, `explain` — all five MVP commands are implemented.
- **One template:** `ui-api-fullstack` (UI + API in a single TypeScript project).
- **Six static rules:** `no-xpath`, `no-nth-child`, `no-css-class-selector`, `no-deep-css-chain`, `prefer-user-facing-locator`, `no-hard-wait`.
- **Tier 1 only** — category-level locator guidance, never a concrete rewrite it can't prove.
- **Internal interfaces only** — no public plugin system yet.
- **Deferred:** `fix`, ESLint plugin, CI/SARIF, DOM-aware suggestions, MCP, LLM features, and the docs portal.

See [Roadmap](docs/Roadmap.md) for the full Phase 0–10 plan.

## Status — public alpha

TestPilot QA is an **alpha**: a local-first, deterministic Playwright **quality toolkit**. It is
**not a test framework** and **does not replace Playwright** — Playwright runs the tests; everything
TestPilot generates is plain, ejectable Playwright.

**What works today:**

- `init` — scaffold a TypeScript Playwright project (UI + API examples) **+ AI agent guidance files**
- `run` — thin Playwright pass-through (not a custom runner)
- `analyze` — static Tier 1 locator analysis (six rules) + Locator Quality Score + `--min-score` gating
- `doctor` — project-readiness diagnostics + AI guidance drift detection
- `explain` — rule education

**Intentionally *not* in the alpha** (planned, not done): auto-fix, DOM-aware/concrete locator
suggestions, baseline/`--changed` brownfield gating, SARIF/HTML reports, a GitHub Action, dashboards,
MCP, and any LLM calls.

**Best early users:** teams already on Playwright, QA/automation engineers cleaning up fragile
suites, and teams using AI coding agents (Claude Code, Codex, Cursor, Copilot) who want their agents
to write resilient Playwright. **Brownfield CI features (baseline / no-regression / PR integration)
are next — not done yet.**

See [docs/Adoption-Plan.md](docs/Adoption-Plan.md) for the sequencing, the [Roadmap](docs/Roadmap.md)
for the full plan, and [docs/Release-Checklist.md](docs/Release-Checklist.md) for the release gate.

## Development

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm -r build
pnpm smoke:mvp        # offline end-to-end smoke of the built CLI
pnpm smoke:package    # pack + install the tarball and run it as a consumer would
```

User-facing changes require a changeset (`pnpm changeset`) and a README/CLI-Spec update. The
pre-release gate lives in [docs/Release-Checklist.md](docs/Release-Checklist.md).
