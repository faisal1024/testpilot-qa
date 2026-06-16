# TestPilot QA — CLI Specification

> Status: Approved — aligned to *Updated Plan After Claude Review*
> Binary name: `testpilot` (alias `tpq`)
> Bootstrap: `npx testpilot-qa` / `npm create testpilot-qa@latest`

> **MVP command surface:** `init`, `run`, `analyze`, `doctor`, `explain`.
> `fix`, `add`, and `list` are **deferred to V1**. `init` ships a **single** `ui-api-fullstack`
> template in MVP. Commands below are tagged *(MVP)* or *(V1)* accordingly.
>
> **Implemented (Milestone 2.5):** `init` (scaffold) and `run` (a thin Playwright pass-through —
> not a custom runner). `analyze`/`doctor`/`explain` are registered placeholders until their phases.

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

| Option | Description | Default |
|---|---|---|
| `--template <id>` | Template pack. **MVP: only `ui-api-fullstack`.** (`ui-pom`, `api`, `component` arrive in V1.) | `ui-api-fullstack` |
| `--language <lang>` | `ts` (others via packs later). | `ts` |
| `--package-manager <pm>` | `pnpm` \| `npm` \| `yarn` \| `bun`. | auto-detect |
| `--base-url <url>` | Seed `baseURL` in Playwright config. | prompt |
| `--ci <provider>` | Generate CI workflow: `github` \| `gitlab` \| `none`. | `github` |
| `--ai <agents...>` | Generate agent files: `claude` `codex` `cursor` `copilot` `all`. | `all` |
| `--no-install` | Skip dependency install. | install |
| `--no-example` | Skip generating/running the example test. | run example |
| `--yes` | Accept all defaults, no prompts. | interactive |

**Behavior (target):** resolves template → previews file plan → writes → installs → runs the example test to prove green → generates AI context files. Detects an existing Playwright project and switches to *augment* mode (adds config + AI files, does not overwrite tests).

> **As implemented (Milestone 2.5):** generates the `ui-api-fullstack` files (`package.json`,
> `playwright.config.ts`, `testpilot.config.ts`, UI + API example tests, `.gitignore`, README,
> GitHub Actions workflow). Supported flags today: `[directory]` (default `.`), `--template`
> (default `ui-api-fullstack`), `--force`, and the global `--json`/`--quiet`. **Never overwrites**
> existing files without `--force` (they are reported as skipped). Dependency install, AI-file
> generation, `--base-url`, `--ci`, and prompts are deferred to later milestones; `--yes` is
> accepted (init is already non-interactive).

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
```

The generated project must still run with plain `npx playwright test`.

---

### 3.2 `testpilot analyze` *(MVP)*

Run Locator Intelligence (and Health Rules) over test files. Read-only.
**MVP scope:** Tier 1 static analysis only; `table` + `json` reporters. `--dom`, `--baseline`,
`sarif`/`html` reporters, and `--changed` land in V1+ (see tags below).

```
testpilot analyze [globs...] [options]
```

| Option | Description | Default | Version |
|---|---|---|---|
| `--reporter <fmt>` | `table` \| `json` (MVP); `html` \| `sarif` (V1). Repeatable. | `table` | MVP / V1 |
| `--output <path>` | Write report to file. | stdout | MVP |
| `--min-score <n>` | Fail if project score `< n` (0–100). | none | MVP |
| `--severity <level>` | Min severity to report: `info`\|`warn`\|`error`. | `info` | MVP |
| `--rules <ids...>` | Only run these rule ids. | all enabled | MVP |
| `--changed` | Analyze only files changed vs base branch (CI speed). | off | V1 |
| `--baseline <path>` | Compare to a saved baseline; report only *new* findings. | none | V1 |
| `--dom <source>` | Tier 2: enrich with DOM context from a trace dir or URL. | none (static) | V2 |

**Examples**
```bash
# Default human report over the suite
testpilot analyze "tests/**/*.spec.ts"

# CI gate: machine output + SARIF for GitHub code scanning + score threshold
testpilot analyze --changed --reporter sarif --output tp.sarif --min-score 80 --json

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

### 3.4 `testpilot doctor` *(MVP)*

Diagnose the project: Playwright version drift, missing config, flaky-pattern hotspots, TestPilot self-check.

```
testpilot doctor [options]
```

Reports: Node version, Playwright dependency presence & version vs supported range, config validity, test-directory presence, AI guidance-file drift, top fragile files, suggested next actions. Exit non-zero on hard problems.

---

### 3.5 `testpilot explain <ruleId>` *(MVP)*

Print a rule's rationale with a bad example, a better example, and a docs link — the terminal-side
education surface that complements per-rule docs pages.

```
testpilot explain no-xpath
testpilot explain prefer-user-facing-locator --json
```

Output (human): rule id, category, severity, *why it matters*, ❌ bad snippet, ✅ better snippet,
`docsUrl`. With `--json`: the same content as a structured object for agents.

---

### 3.6 `testpilot add` *(V1 — deferred)*

Add capabilities to an existing TestPilot project.

```
testpilot add <thing> [options]
```

| `thing` | Effect |
|---|---|
| `ai <agent>` | (Re)generate `claude`\|`codex`\|`cursor`\|`copilot`\|`all` context files. |
| `ci <provider>` | Add a `github`\|`gitlab` workflow. |
| `template <id>` | Layer another template pack (e.g. add `api` onto a UI project). |
| `rule-pack <pkg>` | Install & register a third-party rule pack. |
| `fixture <name>` | Generate a typed fixture stub. |

```bash
testpilot add ai claude
testpilot add template api
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

Stable, versioned envelope so agents and CI can depend on it:

```json
{
  "schemaVersion": "1.0",
  "command": "analyze",
  "summary": { "score": 78, "files": 42, "findings": 17,
               "bySeverity": { "error": 3, "warn": 9, "info": 5 } },
  "findings": [
    {
      "ruleId": "no-css-class-selector",
      "severity": "error",
      "category": "locator",
      "message": "CSS class selector is fragile; class names change with styling.",
      "file": "tests/login.spec.ts",
      "line": 14, "column": 18,
      "raw": "page.locator('.btn-primary')",
      "suggestion": { "kind": "category", "text": "Prefer getByRole('button', { name: ... })" },
      "autoFixable": false,
      "docsUrl": "https://testpilot.dev/rules/no-css-class-selector"
    }
  ]
}
```

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

- **No `testpilot run`** — that's `playwright test`. We never shadow the runner.
- **No `testpilot assert`/custom matchers** — Playwright's `expect` stays the assertion API.
- **No global mutable state / hidden cache** that changes results between identical runs.
