# TestPilot QA

> A developer-experience layer and project accelerator for **Playwright**.
> Not a test framework. Not a Playwright replacement. A toolkit that gets you to *good* Playwright faster — and keeps it good.

TestPilot QA does three jobs:

1. **Scaffold** maintainable Playwright UI + API projects from opinionated templates.
2. **Analyze** existing tests for fragile locators and flaky patterns — *Locator Intelligence*.
3. **Integrate** with AI coding agents (Claude Code, Codex, Cursor, Copilot) so they write good Playwright by default.

It's **local-first, deterministic, and offline** — no network, no API key, no LLM calls. Everything it
generates is **ejectable plain Playwright**: delete `testpilot.config.ts` and the dependency and you
still have a working suite. Zero lock-in.

> **Alpha.** Published on npm under the **`alpha`** dist-tag. It does **not** do DOM-aware healing,
> broad auto-fix, dashboards, MCP, AI-generated tests, or LLM-powered execution — see
> [Status](#status--public-alpha).

## Install

```bash
npm i -D testpilot-qa@alpha     # requires Node >= 20
```

Then every `npx testpilot-qa …` example below resolves to your local copy — no network round-trip.
Prefer not to install? Add the tag inline: `npx testpilot-qa@alpha …`.

> **Pin `@alpha`.** A plain `npm i testpilot-qa` resolves `latest`, which today happens to point at the
> same alpha build — but that is not guaranteed to track future alphas. Always pin.
>
> **What "alpha" promises:** the CLI flags, JSON/SARIF report shapes, baseline file format, and scoring
> weights may change between `alpha.N` releases without a major version bump. If you gate CI on
> `--min-score`, pin an exact version (`testpilot-qa@0.1.0-alpha.0`).

---

## Try it in 2 minutes

**New here?** Scaffold a project and see a locator-quality report in your browser:

```bash
npx testpilot-qa@alpha init demo --yes
cd demo
npx testpilot-qa@alpha analyze tests --reporter html --output testpilot-report.html
# → open testpilot-report.html in your browser
```

**Already have a Playwright project?** `analyze` is read-only — just point it at your tests:

```bash
npx testpilot-qa@alpha analyze tests                    # human table (add --json for CI)

# Adopting on an existing suite? Record a baseline, then gate CI on NEW findings only:
npx testpilot-qa@alpha analyze tests --baseline testpilot-baseline.json --update-baseline
npx testpilot-qa@alpha analyze tests --baseline testpilot-baseline.json
```

That's it. The rest of this README goes deeper on each command.

---

## Commands at a glance

| Command | What it does |
|---|---|
| `init` | Scaffold a TypeScript Playwright project (UI + API examples + AI guidance files). |
| `run` | Thin pass-through to your local Playwright — not a custom runner. |
| `analyze` | Statically score locator quality and flag fragile patterns. Reports as table / JSON / SARIF / HTML. |
| `fix` | Apply safe, behavior-preserving locator rewrites. **Dry-run by default.** |
| `add ai` | Regenerate the AI agent guidance files. **Dry-run by default.** |
| `doctor` | Diagnose project readiness, setup problems, and AI-guidance drift. |
| `explain` | Explain a rule: why it matters, with bad/good examples. |

All commands accept `--quiet` and `--cwd <dir>`, and emit stable `--json` output — except `run`, which
is a pass-through and forwards everything to Playwright.

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
parallel-safe by design.

Already have a Playwright project? Skip `init` and jump straight to **[Analyze locator
quality](#analyze-locator-quality)** — `analyze` is read-only.

---

## Analyze locator quality

`analyze` statically flags fragile locators with six Tier 1 rules — `no-xpath`,
`no-css-class-selector`, `no-nth-child`, `no-deep-css-chain`, `prefer-user-facing-locator`, and
`no-hard-wait` — and prints a human table or stable JSON. Severity is configurable per rule
(`off` disables a rule).

```bash
# Analyze locator quality in your existing tests (read-only)
npx testpilot-qa analyze
npx testpilot-qa analyze --json

# Gate CI on a minimum Locator Quality Score (non-zero exit if below)
npx testpilot-qa analyze --min-score 80

# Write the report to a file instead of stdout
npx testpilot-qa analyze --output testpilot-report.json
```

Every run computes a deterministic **Locator Quality Score** (0–100, graded A–F) with Resilience,
Accessibility, Maintainability, and Flakiness sub-scores. Without `--min-score` it's reporting-only
(exit 0); with `--min-score <n>` (or `scoring.minScore` in config — the flag wins) it exits non-zero
when the score is below the threshold. Scoring is static (Tier 1), not DOM-aware. See
**[docs/Scoring.md](docs/Scoring.md)** for exactly how the score is computed, with worked examples,
and **[docs/rules](docs/rules/README.md)** for every rule with bad → better examples.

Test files are found via `testDir` + `include` from `testpilot.config.ts` (defaults: `tests/`,
`**/*.{spec,test,e2e,e2e-spec}.{ts,tsx,js,jsx,mjs,cjs}` — JavaScript suites and `*.e2e.ts` naming work out of the box), or via explicit
patterns (`npx testpilot-qa analyze "e2e/**/*.spec.ts"`). **A run that matches no files fails** (exit
`3` for config discovery, `2` for patterns) instead of reporting an empty 100/A — so a wrong `testDir`
can't turn into a green CI gate.

### Adopt on an existing suite — brownfield baseline

Adopting on an existing suite with known issues? Record a baseline once, then gate CI on *new*
findings only — exit non-zero only when a regression is introduced, while the pre-existing findings
are grandfathered in.

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

### Reports & pull-request integration

`analyze --reporter` chooses the output format. Beyond `table` and `json`, two reporters make it easy
to share results and run in CI:

```bash
# SARIF 2.1.0 — findings show up inline on the PR "Files changed" tab (code scanning)
npx testpilot-qa analyze --reporter sarif --output testpilot.sarif

# A shareable, self-contained HTML report — open it in any browser
npx testpilot-qa analyze --reporter html --output testpilot-report.html
```

The **HTML report** is a single static file — score, sub-scores, and findings grouped by file, with no
external assets, scripts, or tracking. Good for sharing a snapshot or scanning a suite at a glance.

The bundled **GitHub Action** wraps the CLI (it does not duplicate analysis logic): it runs the gate,
writes SARIF, and adds the human report to the job summary. Pair it with GitHub's `upload-sarif` to
publish the annotations:

> **Note (alpha):** `@v0` is a moving major tag — it is re-pointed as the action changes. Pin a commit
> SHA (`faisal1024/testpilot-qa/action@<sha>`) if you want it frozen.

```yaml
# .github/workflows/testpilot.yml
permissions:
  contents: read
  security-events: write   # required to upload SARIF
jobs:
  testpilot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: faisal1024/testpilot-qa/action@v0
        with:
          version: alpha          # pin the dist-tag; the action defaults to `latest`
          min-score: 80
          baseline: testpilot-baseline.json
      - uses: github/codeql-action/upload-sarif@v3
        if: always()             # upload even when the gate fails
        with:
          sarif_file: testpilot.sarif
```

With `--baseline`, the gate-facing `sarif` and `table` outputs are scoped to the **new** findings only,
so a brownfield PR isn't buried under pre-existing debt; the comprehensive `json` and `html` outputs
stay whole and carry the baseline summary. The CLI is fully usable without GitHub — SARIF is just one
more `--reporter`. (The Action runs the published `testpilot-qa` package via `npx`.) Keep the Action at
your repo root, or set `upload-sarif`'s `checkout_path`/`sourceRoot`, so the file paths resolve in the PR.

---

## Fix locators — `fix`

`fix` applies **behavior-preserving, syntactic** locator rewrites, and is a **dry-run by default** (it
prints a unified diff and writes nothing until you pass `--write`).

```bash
# Preview safe, mechanical rewrites (writes nothing — shows a diff)
npx testpilot-qa fix

# Apply them
npx testpilot-qa fix --write
```

Today it rewrites `page.locator('text=Foo')` → `page.getByText('Foo')` (equivalent matching) and leaves
anything ambiguous untouched. It edits only your test files — never application code — makes **no LLM
calls** and **never inspects the DOM**, so it will **not** turn a CSS/XPath selector into a role locator
(that needs DOM evidence TestPilot doesn't use). It is **not** broad auto-fix. Fixes are idempotent.

## Understand a rule — `explain`

```bash
npx testpilot-qa explain no-xpath
npx testpilot-qa explain no-hard-wait --json
```

`explain` shows why a rule matters, a ✗ bad example, a ✓ better example, and guidance — handy at the
terminal or for feeding an agent.

## Diagnose setup — `doctor`

```bash
npx testpilot-qa doctor
npx testpilot-qa doctor --json
```

`doctor` checks Node version, `package.json`, a local Playwright install, Playwright/TestPilot config
validity, the test directory, project structure, and **AI guidance-file drift**. It prints a
pass/warn/fail report with remediation, is read-only and offline, and uses CI-friendly exit codes
(`0` healthy, `3` invalid config, `4` setup problems). Guidance drift is a **warning only** — it never
fails the command on its own.

---

## Keep AI agents aligned — `add ai`

`init` generates agent-context files from a **single canonical guidance source** (offline, no LLM):
`CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, and
`.cursor/rules/testpilot-playwright.mdc`. They teach agents the locator hierarchy, web-first
assertions, no-hard-waits, API conventions, and the TestPilot commands — and stay honest about Tier 1
limits (no DOM-aware suggestions). Each carries a `version + sha256` marker so drift is detectable.

**Regenerate guidance safely** with `add ai` — it touches *only* the guidance files (never your tests
or scaffold), and is a **dry-run preview by default**:

```bash
# Preview what would change (writes nothing)
npx testpilot-qa add ai

# Apply: create missing files and refresh stale ones
npx testpilot-qa add ai --write

# Just one agent, or every supported agent
npx testpilot-qa add ai claude --write
npx testpilot-qa add ai all --write
```

It reuses `doctor`'s drift detection: missing files are **created**, stale ones (older guidance version)
**updated**, and up-to-date ones left alone. A file you've hand-edited is **never overwritten** unless
you pass `--force`, so your customizations are safe.

---

## The Locator Quality Hierarchy (the core idea)

Everything `analyze`, `fix`, and the AI guidance push toward the same thing: locators that survive
refactors. The hierarchy, best to worst:

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

## Status — public alpha

TestPilot QA is an **alpha**: a local-first, deterministic Playwright **quality toolkit**. It is
**not a test framework** and **does not replace Playwright** — Playwright runs the tests; everything
TestPilot generates is plain, ejectable Playwright.

**What works today:**

- `init` — scaffold a TypeScript Playwright project (UI + API examples) **+ AI agent guidance files**
- `run` — thin Playwright pass-through (not a custom runner)
- `analyze` — static Tier 1 locator analysis (six rules) + Locator Quality Score + `--min-score` gating
- **brownfield baseline** — record known findings and gate CI on *new* ones only (`--baseline`)
- **reporters** — `--reporter table|json|sarif|html`: SARIF for GitHub code scanning, a shareable HTML report, plus a wrapper GitHub Action
- `fix` — safe, behavior-preserving mechanical locator rewrites (dry-run by default)
- `add ai` — safely regenerate AI guidance files (dry-run by default)
- `doctor` — project-readiness diagnostics + AI guidance drift detection
- `explain` — rule education

**Intentionally *not* in the alpha** (planned, not done): DOM-aware/concrete locator suggestions and
DOM-backed healing, broader auto-fix beyond the safe mechanical set, `--changed` diff scoping,
dashboards, MCP, AI-generated tests, and any LLM-powered execution.

**Best early users:** teams already on Playwright, QA/automation engineers cleaning up fragile suites,
and teams using AI coding agents (Claude Code, Codex, Cursor, Copilot) who want their agents to write
resilient Playwright.

**Shipped:** `testpilot-qa@0.1.0-alpha.0` is on npm under the `alpha` dist-tag, CI-published with
provenance. Next up is post-alpha hardening — the deferred dependency majors, each in its own PR. See
the **[release checklist](docs/Release-Checklist.md)**.

---

## Documentation

The design and planning docs (the alpha is implemented; these capture the architecture and
sequencing):

| Document | What it covers |
|---|---|
| [CLI Spec](docs/CLI-Spec.md) | Every command, option, example, and exit code — the reference. |
| [Scoring](docs/Scoring.md) | How the Locator Quality Score is computed — formula, weights, grades, worked examples. |
| [Architecture](docs/Architecture.md) | System architecture, components, package boundaries, dependency & extension strategy — plus **challenged assumptions**. |
| [Locator Intelligence Design](docs/Locator-Intelligence-Design.md) | Locator hierarchy, rules engine, scoring model, suggestions, future AI enhancements. |
| [AI Agent Integration](docs/AI-Agent-Integration.md) | Claude/Codex/Cursor/Copilot support, single-source guidance, MCP, recommended repo structure. |
| [Adoption Plan](docs/Adoption-Plan.md) | Public-alpha readiness, brownfield adoption, CI surfaces, and sequencing tradeoffs. |
| [Roadmap](docs/Roadmap.md) | MVP → V1 → V2 → V3, with sequencing rationale. |
| [GitHub Issues](docs/GitHub-Issues.md) | Prioritized backlog: Epics → Stories → Tasks, with suggested labels. |

---

## Design principles (and pushback on the brief)

- **Two-tier Locator Intelligence.** Static AST analysis ships first (detect + educate); **DOM-aware concrete suggestions** (`getByRole('button', { name: 'Save' })`) come in V2 once they can be validated. Never present a static guess as a DOM-backed fact.
- **Reuse, don't reinvent.** Build on `@typescript-eslint/parser`; an `eslint-plugin-testpilot` follows in **V1** (the rules engine is built to make it a thin adapter) rather than competing with the linter ecosystem.
- **One guidance source, many agent files.** `CLAUDE.md` / `AGENTS.md` / Copilot / Cursor files are *generated* from a single canonical source to prevent drift.
- **TypeScript-first.** Other languages arrive later as community **template packs** behind a stable manifest contract — not a day-one maintainer commitment.
- **Offline by default.** The analyzer and scaffolder need no network and no API key; LLM features are opt-in and isolated.

The original MVP was deliberately narrow — five commands (`init`/`run`/`analyze`/`doctor`/`explain`),
one `ui-api-fullstack` template, six static rules, Tier 1 only — and has since grown the brownfield,
CI, fix, and guidance-regeneration surfaces above. See [Architecture §2](docs/Architecture.md) for the
full set of challenged assumptions and the [Roadmap](docs/Roadmap.md) for the Phase 0–10 plan.

---

## Feedback & bugs

This is an alpha and feedback is the most useful thing you can send. Please
[open an issue](https://github.com/faisal1024/testpilot-qa/issues) — especially for **false positives**,
which matter most right now. Include `npx testpilot-qa --version` and, if relevant,
`npx testpilot-qa doctor --json`. Security reports: see [SECURITY.md](SECURITY.md).
Contributions: [CONTRIBUTING.md](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · [MIT license](LICENSE).

## Development

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm -r build
pnpm smoke:mvp        # offline end-to-end smoke of the built CLI
pnpm smoke:package    # pack + install the tarball and run it as a consumer would
```

User-facing changes require a changeset (`pnpm changeset`) and a README/CLI-Spec update. The
pre-release gate lives in [docs/Release-Checklist.md](docs/Release-Checklist.md).
