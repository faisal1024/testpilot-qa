# TestPilot QA — CLI Specification

> Status: Approved — aligned to *Updated Plan After Claude Review*
> Binary name: `testpilot` (alias `tpq`)
> Bootstrap: `npx testpilot-qa` / `npm create testpilot-qa@latest`

> **MVP command surface:** `init`, `run`, `analyze`, `doctor`, `explain`. `fix` and `list` are
> **deferred to V1**; of `add`, only the `add ai` subcommand is implemented (6C). `init` ships a
> **single** `ui-api-fullstack` template in MVP. Commands below are tagged *(MVP)* or *(V1)* accordingly.
>
> **Implemented today:** `init` (scaffold, 2.5), `run` (thin Playwright pass-through, 2.5), `analyze`
> (static Locator Intelligence — six Tier 1 rules, Locator Quality Score, `--min-score` gating,
> `--baseline` no-regression gate, `--reporter table|json|sarif`; 3A–3C, 6A–6B), `doctor` (project
> diagnostics + AI guidance drift; 4B, 5B), `explain` (rule education; 4A), and `add ai` (safe AI
> guidance regeneration; 6C).

---

## 1. Design Principles

1. **Guessable.** Verbs are obvious: `init`, `analyze`, `fix`, `add`, `doctor`.
2. **Non-destructive by default.** Anything that writes shows a plan and asks, unless `--yes`. Anything that mutates user test code requires explicit `fix --write`.
3. **Machine-readable on demand.** Every command supports `--json`. Human output is the derived view.
4. **CI-friendly exit codes.** Deterministic, documented (§7).
5. **Offline by default.** No network or LLM unless a flag opts in.
6. **Composable.** Commands do one thing; output of `analyze` feeds `fix`.

---

## 2. Global Options

| Option | Description |
|---|---|
| `--json` | Emit machine-readable JSON to stdout; suppress decorative output. |
| `--config <path>` | Path to `testpilot.config.ts`. Default: auto-discover upward. |
| `--cwd <path>` | Run as if in this directory. |
| `--yes`, `-y` | Skip confirmation prompts (CI). |
| `--quiet`, `-q` | Errors only. |
| `--verbose` | Debug logging. |
| `--no-color` | Disable ANSI color. |
| `--version`, `-v` | Print version. |
| `--help`, `-h` | Contextual help (works on every subcommand). |

---

## 3. Commands (MVP → V1)

### 3.1 `testpilot init` *(MVP)*

Scaffold a new TestPilot-managed Playwright project, or add TestPilot to an existing one.

```
testpilot init [directory] [options]
```

> The table below is the **target** option surface. Flags actually implemented in Milestone 2.5 are
> `[directory]`, `--template`, `--force`, and the globals `--json`/`--quiet` (see the implemented
> note after the table). The remaining options are planned for later milestones.

| Option | Description | Default | Status |
|---|---|---|---|
| `--template <id>` | Template pack. **MVP: only `ui-api-fullstack`.** (`ui-pom`, `api`, `component` arrive in V1.) | `ui-api-fullstack` | implemented |
| `--force` | Overwrite existing files (otherwise they are skipped). | off | implemented |
| `--language <lang>` | `ts` (others via packs later). | `ts` | planned |
| `--package-manager <pm>` | `pnpm` \| `npm` \| `yarn` \| `bun`. | auto-detect | planned |
| `--base-url <url>` | Seed `baseURL` in Playwright config. | prompt | planned |
| `--ci <provider>` | Generate CI workflow: `github` \| `gitlab` \| `none`. | `github` | planned |
| `--ai <agents...>` | Generate agent files: `claude` `codex` `cursor` `copilot` `all`. | `all` | planned |
| `--no-install` | Skip dependency install. | install | planned |
| `--no-example` | Skip generating/running the example test. | run example | planned |
| `--yes` | Accept all defaults, no prompts. | interactive | accepted (no-op) |

**Behavior (target):** resolves template → previews file plan → writes → installs → runs the example test to prove green → generates AI context files. Detects an existing Playwright project and switches to *augment* mode (adds config + AI files, does not overwrite tests).

> **As implemented (Milestone 2.5 + 5A):** generates the `ui-api-fullstack` files (`package.json`,
> `playwright.config.ts`, `testpilot.config.ts`, UI + API example tests, `.gitignore`, README,
> GitHub Actions workflow) **plus AI agent guidance files** (`CLAUDE.md`, `AGENTS.md`,
> `.github/copilot-instructions.md`, `.cursor/rules/testpilot-playwright.mdc`) from one canonical
> source. Supported flags today: `[directory]` (default `.`), `--template` (default
> `ui-api-fullstack`), `--force`, and the global `--json`/`--quiet`. **Never overwrites** existing
> files without `--force` (they are reported as skipped, in both human and JSON output). Dependency
> install, `--base-url`, `--ci`, and prompts are deferred to later milestones; `--yes` is accepted
> (init is already non-interactive).

**Examples**
```bash
testpilot init demo --yes
testpilot init demo --template ui-api-fullstack --force
testpilot init demo --json
```

---

### 3.1a `testpilot run` *(MVP — implemented in 2.5)*

Run Playwright tests through a **thin pass-through**. TestPilot adds no execution semantics — Playwright remains the runner.

```
testpilot run [-- <playwright args>]
```

**Behavior:** finds the project root (nearest `package.json`), loads `testpilot.config.ts` if
present, resolves the Playwright config (from `config.playwrightConfig` or discovery), invokes the
**local** `node_modules/.bin/playwright test`, forwards any args after `--` verbatim, and exits with
Playwright's own exit code.

| Situation | Exit code |
|---|---|
| Playwright's result | passes through (Playwright's code) |
| Invalid `testpilot.config.ts` | `3` |
| Playwright not installed locally | `4` (message: run `npm install`) |

**Examples**
```bash
testpilot run
testpilot run -- --project=chromium
testpilot run -- tests/example.spec.ts
testpilot run -- --workers=2              # Playwright parallelism, passed straight through
testpilot run -- tests/ui --workers=2     # run only the UI tests, with 2 workers
```

Parallelism is **Playwright's** (`fullyParallel: true` + `--workers`), not TestPilot's — `run`
forwards everything after `--` verbatim. The generated project must still run with plain
`npx playwright test`, and exposes `test:e2e`, `test:e2e:ui`, `test:e2e:api`, `test:e2e:parallel`,
and `test:e2e:headed` npm scripts.

---

### 3.2 `testpilot analyze` *(MVP)*

Run Locator Intelligence over test files. Read-only.
**MVP scope:** Tier 1 static analysis only; `table` + `json` reporters. `--dom`, `--baseline`,
`sarif`/`html` reporters, and `--changed` land in V1+ (see tags below).

```
testpilot analyze [globs...] [options]
```

> **As implemented (Milestone 3B–3C):** the full MVP Tier 1 rule set runs —
> `no-xpath`, `no-css-class-selector`, `no-nth-child`, `no-deep-css-chain`,
> `prefer-user-facing-locator` (locator), and `no-hard-wait` (flakiness). Files come from the
> positional globs (a positional that is a **directory** is expanded into its test files, so
> `analyze examples/fragile-suite` works), else `config.include` resolved under `config.testDir`.
> Output is the human
> table (default) or stable `--json`. Per-rule **severity is config-driven** (`rules: { 'no-xpath':
> 'warn' }`; `'off'` disables). Unknown rule ids in config surface as **warnings** (not failures).
> Unparseable files are reported in `parseErrors` and skipped. Rules give **category-level guidance
> only** (no concrete, DOM-derived rewrites).
>
> **Scoring & gating (3C):** every run computes a deterministic, static **Locator Quality Score**
> (0–100) with a letter grade (A ≥90, B ≥80, C ≥70, D ≥60, F <60) and four sub-scores — Resilience
> (locator rules), Flakiness (flakiness rules), Accessibility, Maintainability (the last two stay
> 100 until such rules exist). **Score model:** `penalty = Σ severity weight`,
> `maxPenalty = analyzed call-sites × error weight`, `score = clamp(round(100 × (1 − penalty/maxPenalty)), 0, 100)`;
> weights come from `config.scoring.weights`. **Zero call-sites → 100/A** (no detectable debt).
> Parse errors are reported but **do not** affect the score yet.
>
> **`--min-score <n>`** gates CI: if the score is below `n`, the command exits **1** with a clear
> message; otherwise (and whenever no threshold is set) it exits **0**. **Precedence:** the
> `--min-score` flag wins; otherwise `config.scoring.minScore`; otherwise no gating. `--json` still
> prints the full report (including `score`) even when the gate fails. Still Tier 1 / static — not
> DOM-aware.
>
> **Output & baseline (6A):** **`--output <path>`** writes the full JSON report to a file (creating
> parent directories) instead of stdout. **`--baseline <path>`** compares the current findings to a
> saved baseline and gates on *new* findings only — exit **1** when a regression appears, exit **0**
> when every current finding is grandfathered in. A finding's baseline identity is `ruleId + file +
> snippet` (line/column/severity-independent; whitespace runs are collapsed to a single space and
> trimmed, so re-indentation, tabs, and doubled spaces never resurface an accepted finding, while
> distinct selector text such as `getByText('Log in')` vs `getByText('Login')` stays a separate
> identity so a real new finding is never silently masked), so moving code or re-grading a rule does
> not create a regression; duplicate findings are counted, so an *extra* occurrence beyond the baseline
> count is treated as new. A call site that gets hard line-wrapped across physical lines may register
> as new until you refresh the baseline — a deliberate, visible miss rather than a silent one. **`--update-baseline`** (requires `--baseline`) records the current findings to
> that path and exits **0** without gating. When `--baseline` is active the JSON report gains a
> `baseline` block (`{ path, newFindings, baselinedFindings }`). Missing/malformed baseline files and
> unwritable `--output`/`--baseline` paths exit **2** (usage) with a clear message.
>
> **Reporters & CI integration (6B):** **`--reporter <table|json|sarif>`** chooses the output format
> for both stdout and `--output`. `table` is the human report; `json` is the stable machine report;
> `sarif` emits a **SARIF 2.1.0** log so findings appear as GitHub code-scanning annotations at the
> exact file/line. An unknown reporter exits **2**. Back-compat: with no `--reporter`, `--json` or a
> bare `--output` still imply `json`, and interactive runs default to `table`. SARIF results carry a
> `partialFingerprints['testpilotIdentity/v1']` equal to the baseline identity, so code scanning does
> not re-report a finding that merely moved lines. With `--baseline`, the **SARIF and table outputs are
> scoped to the new findings only** (matching what the gate fails on); the JSON report stays whole and
> carries the `baseline` summary. A composite **GitHub Action**
> (`faisal1024/testpilot-qa/action@v0`) wraps the CLI — it runs `analyze`, writes SARIF, and posts the
> human report to the job summary; it duplicates no analysis logic. Pair it with
> `github/codeql-action/upload-sarif` to publish annotations. The CLI works fully without GitHub.

| Option | Description | Default | Version |
|---|---|---|---|
| `--reporter <fmt>` | `table` \| `json` \| `sarif` (`html` planned). | `table` | MVP / 6B |
| `--output <path>` | Write the report (in `--reporter` format) to a file. | stdout | MVP (6A) |
| `--min-score <n>` | Fail if project score `< n` (0–100). | none | MVP |
| `--baseline <path>` | Compare to a saved baseline; gate on *new* findings only. | none | MVP (6A) |
| `--update-baseline` | Record current findings to `--baseline` (no gate). | off | MVP (6A) |
| `--severity <level>` | Min severity to report: `info`\|`warn`\|`error`. | `info` | MVP |
| `--rules <ids...>` | Only run these rule ids. | all enabled | MVP |
| `--changed` | Analyze only files changed vs base branch (CI speed). | off | V1 |
| `--dom <source>` | Tier 2: enrich with DOM context from a trace dir or URL. | none (static) | V2 |

**Examples**
```bash
# Default human report over the suite
testpilot analyze "tests/**/*.spec.ts"

# CI gate: SARIF for GitHub code scanning + baseline (new findings only) + score threshold
testpilot analyze --reporter sarif --output testpilot.sarif --baseline testpilot-baseline.json --min-score 80

# Tier 2: concrete suggestions from a Playwright trace
testpilot analyze tests/login.spec.ts --dom ./test-results/login/trace.zip
```

---

### 3.3 `testpilot fix` *(V1 — deferred)*

> Deferred per the approved plan: `fix` ships **after** static analysis has proven useful, so
> detection precision is established before TestPilot writes to user test code. Spec retained here
> for design continuity; not part of MVP.

Apply safe, mechanical rewrites suggested by `analyze`. Mutates test code — gated.

```
testpilot fix [globs...] [options]
```

| Option | Description | Default |
|---|---|---|
| `--write` | Actually write changes. Without it: dry-run diff only. | dry-run |
| `--rules <ids...>` | Limit to specific rules. | auto-fixable only |
| `--interactive`, `-i` | Approve each change. | off |
| `--dom <source>` | Use DOM context to produce concrete locator rewrites. | none |

**Behavior:** only rules marked `autoFixable` are applied. Without `--dom`, fixes are conservative (e.g. `waitForTimeout` → comment+TODO, `.locator('text=x')` → `getByText('x')`). Concrete role-based rewrites require `--dom`. Always shows a unified diff first.

**Examples**
```bash
testpilot fix "tests/**/*.spec.ts"            # preview diffs, write nothing
testpilot fix "tests/**/*.spec.ts" --write -i # apply, approving each
```

---

### 3.4 `testpilot doctor` *(MVP — implemented in 4B)*

Diagnose project readiness and common setup issues. Read-only, offline, deterministic.

```
testpilot doctor          # human report
testpilot doctor --json   # stable machine-readable report
testpilot doctor --quiet  # no output; exit code only
```

**Checks (MVP):** Node.js version, `package.json` presence, local Playwright install, Playwright
config discovery, `testpilot.config.ts` validity, test-directory existence, include-pattern sanity,
TestPilot project-structure (when scaffolded), and **AI guidance-file drift** (5B).

**AI guidance drift (`ai-guidance`):** for the agents selected by `config.ai.agents` (default: all),
checks each expected file (`CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`,
`.cursor/rules/testpilot-playwright.mdc`). State per file: `current`, `missing`, `edited`
(user-modified), `stale` (older marker version), or `no-marker`. **Detection only** — read-only,
deterministic, never regenerates or overwrites. Drift is a **warning, never a hard failure**, so it
does not by itself change the exit code. The structured per-file detail is in `check.details.files`.

**Output:** an overall status (`pass`/`warn`/`fail`), each check (`id`, `title`, `category`,
`status`, `message`, optional `remediation`, optional `details`), and deduped `nextActions`. `--json`
envelope:

```json
{
  "schemaVersion": "1.0",
  "command": "doctor",
  "status": "fail",
  "checks": [
    { "id": "playwright-installed", "title": "Playwright installed", "category": "environment",
      "status": "fail", "message": "Playwright is not installed locally.",
      "remediation": "Add it (`npm install -D @playwright/test`) and run `npm install`." }
  ],
  "nextActions": ["Add it (`npm install -D @playwright/test`) and run `npm install`."]
}
```

**Exit codes:** `0` when no checks fail (warnings are not hard problems); `3` when the config is
invalid; `4` for environment/project setup problems (e.g. missing Playwright or `package.json`);
`5` only on an unexpected internal error. (Config failure takes precedence → `3`.)

---

### 3.5 `testpilot explain <ruleId>` *(MVP — implemented in 4A)*

Explain a rule: why it matters, a bad example, a better example, and guidance — the terminal-side
education surface. Available for all six MVP Tier 1 rules.

```
testpilot explain no-xpath
testpilot explain prefer-user-facing-locator --json
```

**Output (human):** rule id, default severity, category, title, summary, *why it matters*,
✗ bad example, ✓ better example, guidance bullets, and `docsUrl`. With `--json`: the same fields as
a stable object (`id`, `category`, `defaultSeverity`, `title`, `summary`, `whyItMatters`,
`badExample`, `betterExample`, `guidance`, `docsUrl`).

An unknown rule id prints a clear error listing the available rules and exits **2**. Examples are
Tier 1 / static — self-contained illustrations that never claim knowledge of your DOM; no concrete
DOM-derived replacements, auto-fix, or AI.

---

### 3.6 `testpilot add` *(`add ai` implemented in 6C; other subcommands V1 — deferred)*

Add or regenerate capabilities in an existing TestPilot project.

```
testpilot add <thing> [options]
```

| `thing` | Effect | Status |
|---|---|---|
| `ai [agent]` | Regenerate AI guidance files: `claude`\|`codex`\|`cursor`\|`copilot`\|`all`. | **6C** |
| `ci <provider>` | Add a `github`\|`gitlab` workflow. | V1 |
| `template <id>` | Layer another template pack (e.g. add `api` onto a UI project). | V1 |
| `rule-pack <pkg>` | Install & register a third-party rule pack. | V1 |
| `fixture <name>` | Generate a typed fixture stub. | V1 |

#### `testpilot add ai [agent]` *(6C)*

Regenerates **only** the AI guidance files — never scaffold or test files, and no LLM. Reuses the same
drift classification as `doctor`'s `ai-guidance` check.

> **Dry run by default.** With no `--write`/`--force` it previews and writes nothing. `--write` applies
> create/update actions; `--force` implies `--write` **and** also overwrites files edited after
> generation. Per-file outcomes: **missing → create**, **stale (older guidance version) → update**,
> **current → unchanged**, **edited / unmarked → kept** (only overwritten with `--force`). User edits
> are never clobbered by default. `[agent]` is one id or `all`; omitted, it uses `config.ai.agents`.
> An unknown agent exits **2**. `--json` emits `{ command:'add', resource:'ai', dryRun, files[], summary }`.

```bash
testpilot add ai                 # preview all configured agents
testpilot add ai --write         # create missing + refresh stale
testpilot add ai claude --force  # regenerate CLAUDE.md even if hand-edited
```

---

### 3.7 `testpilot list` *(V1 — deferred)*

Discoverability for templates, rules, reporters.

```bash
testpilot list templates
testpilot list rules --json
testpilot list reporters
```

---

## 4. Configuration File

`testpilot.config.ts` — the composition root. Validated with zod, typed for autocomplete.

```ts
import { defineConfig } from 'testpilot-qa'

export default defineConfig({
  testDir: 'tests',
  include: ['**/*.spec.ts'],
  scoring: { minScore: 80, weights: { error: 5, warn: 2, info: 0.5 } },
  rules: {
    // MVP rule set (see Locator-Intelligence-Design §5)
    'no-xpath': 'error',
    'no-nth-child': 'error',
    'no-css-class-selector': 'error',
    'no-deep-css-chain': 'warn',
    'prefer-user-facing-locator': 'warn',
    'no-hard-wait': 'error',
  },
  // rulePacks (external) is a V2 public-plugin feature — not configurable in MVP.
  ai: { agents: ['claude', 'cursor'] },
})
```

---

## 5. Output Contract (`--json`)

Stable, versioned envelope so agents and CI can depend on it. The shape below matches the
**implemented `analyze` report (`schemaVersion` `1.3`)**. (DOM-derived suggestions remain out of Tier 1.)

```json
{
  "schemaVersion": "1.3",
  "command": "analyze",
  "summary": {
    "filesAnalyzed": 3,
    "filesWithParseErrors": 0,
    "findings": 9,
    "bySeverity": { "info": 0, "warn": 4, "error": 5 }
  },
  "score": {
    "score": 18,
    "grade": "F",
    "callSites": 8,
    "subScores": {
      "resilience": { "score": 30, "grade": "F" },
      "accessibility": { "score": 100, "grade": "A" },
      "maintainability": { "score": 100, "grade": "A" },
      "flakiness": { "score": 88, "grade": "B" }
    }
  },
  "findings": [
    {
      "ruleId": "no-css-class-selector",
      "category": "locator",
      "severity": "error",
      "message": "CSS class selectors are coupled to styling and change frequently.",
      "file": "tests/login.spec.ts",
      "line": 3,
      "column": 14,
      "snippet": "page.locator('.btn-primary')",
      "suggestion": "Prefer getByRole() or getByTestId() over class-based selectors.",
      "docsUrl": "https://testpilot.dev/rules/no-css-class-selector"
    }
  ],
  "warnings": [
    { "code": "unknown-rule", "ruleId": "made-up", "message": "Unknown rule \"made-up\" in config — ignored." }
  ],
  "parseErrors": [{ "file": "tests/broken.spec.ts", "message": "..." }],
  "baseline": { "path": "testpilot-baseline.json", "newFindings": 1, "baselinedFindings": 8 }
}
```

`baseline` is present **only** when the run used `--baseline`; it reports the comparison summary
against the saved baseline. Findings are sorted by `(file, line, column, ruleId)`, so the report is
deterministic and diffable.

**SARIF (`--reporter sarif`)** is a derived view of the same findings, not a second contract: each
distinct `ruleId` becomes a SARIF reporting descriptor (with its `helpUri`), and each finding becomes a
result whose `level` maps from severity (`error`→`error`, `warn`→`warning`, `info`→`note`) at its
`physicalLocation` (file URI + 1-based line/column + snippet). Each result carries
`partialFingerprints['testpilotIdentity/v1']` (the baseline identity) so code scanning tracks a finding
across line moves.

---

## 6. UX Conventions

- Prompts only when interactive *and* a required value is missing; `--yes` + flags = fully scriptable.
- Every write previews a **file plan** / **diff** before touching disk.
- Color and spinners auto-disable when not a TTY or under `--json`.
- Help text on every subcommand includes a copy-pasteable example.

---

## 7. Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success / no gating threshold breached. |
| `1` | Findings exceeded gate (`--min-score`/`--severity`) — *expected CI failure*. |
| `2` | Usage error (bad flag/args). |
| `3` | Config error (invalid/missing `testpilot.config.ts`). |
| `4` | Environment error (unsupported Node/Playwright, missing deps). |
| `5` | Internal error (bug — should be reported). |

Distinguishing `1` (legitimate quality gate) from `2–5` (operational failures) lets CI treat them differently.

---

## 8. Future Command Roadmap

| Command | Version | Purpose |
|---|---|---|
| `testpilot score --watch` | V1 | Live quality score in the terminal during development. |
| `testpilot baseline` | V1 | Snapshot current findings so only *new* issues fail CI (brownfield adoption). |
| `testpilot review` | V1 | Emit findings as a GitHub PR review/annotations (pairs with the Action). |
| `testpilot fix` | V1 | Apply safe auto-fixes (deferred until static analysis is proven). |
| `testpilot add` / `testpilot list` | V1 | Layer capabilities / discover templates & rules. |
| `testpilot record` | V2 | Wrap `playwright codegen` and post-process output through Locator Intelligence so recorded tests are good by default. |
| `testpilot heal` | V2 | Tier-2 DOM-aware suggestions for locators that broke after a UI change. |
| `testpilot migrate` | V2 | Codemod legacy suites (e.g. Cypress/Selenium → Playwright) through the rules engine. |
| `testpilot dashboard` | V3 | Local web UI for trend lines and hotspots over time. |
| `testpilot agent` | V3 | Structured request/response endpoint optimized for AI agents (batch analyze+fix). |

---

## 9. Anti-Goals (commands we deliberately won't build)

- **`testpilot run` is a thin pass-through only** — it shells out to the project's local Playwright and preserves its exit code. It is **not** a custom runner and never reimplements execution; `npx playwright test` always works without it.
- **No `testpilot assert`/custom matchers** — Playwright's `expect` stays the assertion API.
- **No global mutable state / hidden cache** that changes results between identical runs.
