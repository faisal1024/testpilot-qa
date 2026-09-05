# TestPilot QA — Adapted Adoption Plan

> Status: Product-owner plan after MVP/5A/5B review. **Merged:** 5C (public alpha hardening), 5D
> (dependency PR cleanup), 6A (brownfield baseline & output), 6B (CI & PR integration: SARIF + GitHub
> Action), 6C (safe AI guidance regeneration: `testpilot add ai`), 7A (local HTML report), 7B (score
> calibration docs), and 8A (safe mechanical fix preview: `testpilot fix`).
> **✅ The public alpha shipped:** `testpilot-qa@0.1.0-alpha.0` is on npm under the `alpha` dist-tag
> (CI-published with provenance, 2026-09-05).
> **Next active focus: post-alpha hardening** — the deferred runtime/toolchain dependency majors
> (`@biomejs/biome` 2.x, `zod` 4.x, `commander` 15, `typescript` 6/7, a Node 22 + pnpm 10+ toolchain
> bump, then `@changesets/cli` 3.x and `changesets/action` v2), each in its own PR with a full local gate. No new feature milestone is in
> progress.
> Purpose: sequence the next work so TestPilot becomes useful in real Playwright projects before
> investing in higher-risk AI, DOM-aware, or auto-fix features.
>
> **Positioning (unchanged):** TestPilot QA is an **AI-agent-ready Playwright quality toolkit** — not a
> Playwright replacement. It does **not** do DOM-aware healing, broad auto-fix, dashboards, MCP,
> AI-generated tests, or LLM-powered execution. The `fix` command is a deliberately narrow, safe
> mechanical preview (dry-run by default), not general auto-fix.

---

## Product Thesis

TestPilot QA should be positioned as an **AI-agent-ready Playwright quality toolkit**, not as an AI
testing platform and not as a Playwright replacement.

The strongest public promise is:

> Scaffold sane Playwright projects, analyze existing suites for fragile locators and flaky waits,
> explain the problems, diagnose setup, and keep AI coding agents aligned with good Playwright
> conventions.

That is narrower than "AI test automation", but more credible. It earns trust before adding magic.

---

## Market Read

Playwright is becoming the default modern browser automation choice for many TypeScript teams, but
teams still struggle with the same practical problems:

- brittle locators that break on DOM/CSS refactors;
- hard waits and flaky timing;
- unclear project structure in new suites;
- brownfield suites that are too messy to fix all at once;
- AI coding agents that generate plausible but fragile Playwright;
- difficulty adding quality gates without blocking the whole team on legacy debt.

The market is crowded with "AI testing" claims. TestPilot should avoid that trap. Local,
deterministic, explainable checks are a better early wedge than promising self-healing or generated
tests before the static core has trust.

---

## Who It Helps First

Best-fit early users:

- developers starting a Playwright suite;
- QA automation engineers cleaning up fragile Playwright tests;
- teams using Claude Code, Codex, Cursor, Copilot, or similar agents to write tests;
- teams that want a small local quality gate before buying or building a larger platform;
- educators and content creators teaching resilient Playwright patterns.

Poor-fit early users:

- teams that need hosted dashboards, test history, visual testing, or analytics immediately;
- non-TypeScript teams;
- teams expecting AI-generated tests or self-healing locators today;
- mature enterprise QA teams with a heavily customized internal framework.

This is fine. The early product should win a focused audience before expanding.

---

## What Must Be True Before Public Alpha

Do not make the repo public as a broad "testing platform" yet. Make it public as an **alpha** when:

- all MVP commands work from a clean install: `init`, `run`, `analyze`, `doctor`, `explain`;
- `doctor` safely detects AI guidance drift without recommending broad project overwrites;
- dependency PR optics are clean enough that the repo does not look neglected;
- `npm pack` or equivalent local package-install smoke testing is documented and passing;
- README clearly says what exists today and what is intentionally not included;
- one or two realistic examples show the value on an existing or intentionally fragile suite.

Recommended public label:

> Alpha: Playwright scaffold + static locator analysis + quality score + setup doctor + AI-agent
> guidance. No auto-fix, no DOM-aware suggestions, no LLM calls.

---

## Adapted Sequence

### 0. Finish Milestone 5B safely

Scope:

- merge AI guidance drift detection;
- keep it read-only and warning-only;
- avoid recommending `testpilot init --force` for drift because it can overwrite more than guidance
  files;
- recommend review/manual update until a guidance-only regeneration command exists.

Why:

Trust is fragile. A warning should never point users at a broad destructive action.

### 1. Alpha hardening and package smoke

Scope:

- add a release smoke that exercises `npm pack` or a local package install path;
- verify `npx`-style usage as closely as possible without publishing;
- add an `examples/fragile-suite` or similar fixture showing bad locators and the resulting score;
- keep `smoke:mvp` fast and offline;
- clean up obvious stale status text in docs.

Why:

First impressions matter more than one more feature. A user should be able to install, run, and
understand the tool without guessing.

### 2. Dependency and repo hygiene

Scope:

- merge low-risk dependency PRs that are green;
- handle runtime/toolchain major bumps individually (`commander`, `zod`, TypeScript, Biome);
- do not batch risky majors;
- keep CI green and visible.

Why:

Open, failing dependency PRs make an early public repo look unmaintained even when the product work is
good.

### 3. Brownfield adoption before more magic

Scope:

- add `analyze --output <path>`;
- add a baseline file so existing projects can gate on "no new debt";
- add `--changed` or a simple changed-files mode for PR workflows;
- make the report useful in CI without requiring a hosted service.

Why:

Most real teams adopt tools in existing repos. A baseline/no-regression flow is more adoption-critical
than adding another scaffold option.

### 4. PR/CI surfaces

Scope:

- SARIF reporter for GitHub code scanning;
- GitHub Action wrapper;
- concise PR annotations or review summary;
- documentation for "warn first, then gate later".

Why:

The product becomes much more likely to be used when it fits naturally into pull requests.

### 5. Guidance regeneration

Scope:

- implement `testpilot add ai` or equivalent guidance-only regeneration;
- never overwrite user-edited guidance without clear intent;
- use the existing marker/hash detection from `doctor`;
- prefer dry-run/diff behavior when possible.

Why:

After `doctor` can detect drift, users need a narrow safe way to repair it. `init --force` is too
broad for that job.

### 6. HTML report and examples

Scope:

- static local HTML report;
- score breakdown with example findings;
- links from each finding to `explain`/rule docs;
- screenshots or example artifacts for README/docs.

Why:

Reports sell the tool. Teams share reports, and maintainers need something easier to scan than raw
terminal output.

### 7. Safe auto-fix, only after adoption

Scope:

- start with mechanical, low-risk fixes only;
- default to dry-run diff;
- require `--write` to mutate files;
- keep DOM-derived locator rewrites out until DOM context exists.

Why:

Mutating tests is a trust event. A bad fix can do more damage than a missed warning.

### 8. DOM-aware analysis later

Scope:

- ingest Playwright traces or DOM snapshots;
- validate suggested locators for uniqueness;
- only then produce concrete replacements like `getByRole('button', { name: 'Save' })`;
- keep live crawling secondary because it is flakier than trace/snapshot analysis.

Why:

This is the real differentiator, but it must be accurate. Static guesses must never masquerade as
DOM-backed facts.

---

## Positioning Rules

Use this language:

- "Playwright quality toolkit"
- "AI-agent-ready"
- "local-first"
- "static Tier 1 analysis"
- "plain, ejectable Playwright"
- "no-regression quality gate"

Avoid this language until the features exist:

- "AI testing platform"
- "self-healing"
- "auto-repair"
- "generate tests with AI"
- "DOM-aware suggestions"
- "replace Playwright"

---

## Changes To Existing Work To Consider

- Soften generated guidance markers from "Do not hand-edit" to language that acknowledges teams may
  customize files and `doctor` will report drift.
- Add scoring examples so users understand why a suite got a particular Locator Quality Score.
- Add a "Why not just ESLint?" section: TestPilot's answer is suite-level score, explainable
  education, scaffold, CI/baseline workflow, AI-agent guidance, and future DOM-aware validation.
- Treat scaffolding as an onboarding path, not the main long-term adoption driver.
- Prioritize brownfield analysis and CI adoption before more templates.

---

## Near-Term Milestone Proposal

After Milestone 5B:

1. **5C — Public alpha hardening (merged):** package smoke (`smoke:package`), `examples/fragile-suite`,
   README alpha positioning, dependency-PR strategy. The CLI now bundles `@testpilot/*` so the
   published `testpilot-qa` is a single self-contained package.
2. **6A — Brownfield baseline (merged):** baseline file, no-regression gate, output file support.
3. **6B — PR integration (merged):** SARIF reporter, GitHub Action wrapper, PR job summary.
4. **6C — Guidance regeneration (merged):** `testpilot add ai` with safe drift-aware behavior.
5. **7A — HTML report (merged):** local static report for sharing and demos.
6. **7B — Scoring docs (merged):** [`docs/Scoring.md`](Scoring.md) — calibrate trust in the score.
7. **8A — Safe fix preview (merged):** `testpilot fix` — dry-run mechanical locator rewrites.
8. **Public alpha (shipped):** published `testpilot-qa@0.1.0-alpha.0` on 2026-09-05 — CI release with
   provenance, `alpha` dist-tag, git tag + GitHub pre-release.
9. **Post-alpha hardening (active):** deferred dependency majors, each in its own PR with a full gate.

This sequence should produce a tool people can try publicly, then a tool teams can adopt in CI.

