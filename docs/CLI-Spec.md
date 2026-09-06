# TestPilot QA — CLI Specification

> Status: Approved — aligned to *Updated Plan After Claude Review*
> Binary name: `testpilot` (alias `tpq`)
> Bootstrap: `npx testpilot-qa@alpha init` (there is no `create-testpilot-qa` package)

> **MVP command surface:** `init`, `run`, `analyze`, `doctor`, `explain`. `list` is **deferred to V1**;
> `fix` has a safe-preview foundation (8A) with `--dom`/`-i`/`--rules` deferred; of `add`, only the
> `add ai` subcommand is implemented (6C). `init` ships a **single** `ui-api-fullstack` template in MVP.
> Commands below are tagged *(MVP)* or *(V1)* accordingly.
>
> **Implemented today:** `init` (scaffold, 2.5), `run` (thin Playwright pass-through, 2.5), `analyze`
> (static Locator Intelligence — six Tier 1 rules, Locator Quality Score, `--min-score` gating,
> `--baseline` no-regression gate, `--reporter table|json|sarif|html`; 3A–3C, 6A–6B, 7A), `doctor`
> (project diagnostics + AI guidance drift; 4B, 5B), `explain` (rule education; 4A), `fix` (safe
> mechanical rewrites, dry-run by default; 8A), and `add ai` (safe AI guidance regeneration; 6C).

---

## 1. Design Principles

1. **Guessable.** Verbs are obvious: `init`, `analyze`, `fix`, `add`, `doctor`.
2. **Non-destructive by default.** Anything that writes shows a plan and asks, unless `--yes`. Anything that mutates user test code requires explicit `fix --write`.
3. **Machine-readable on demand.** Every command supports `--json` (except `run`, a Playwright pass-through). Human output is the derived view.
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
| `--no-playwright-discovery` | Do not read `testDir`/`testMatch` from `playwright.config.*`. |
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

### 3.1a `testpilot run` *(MVP — implemented in 2.5; tag selection in Phase 10)*

Run Playwright tests through a **thin pass-through**. TestPilot adds no execution semantics — Playwright remains the runner.

```
testpilot run [--tag <tags>] [--exclude-tag <tags>] [--suite <name>] [-- <playwright args>]
```

| Flag | Meaning |
|---|---|
| `--tag <tags>` | Run tests carrying any of these tags. Comma-separated, repeatable. A `!` prefix excludes. |
| `--exclude-tag <tags>` | Skip tests carrying any of these tags. Comma-separated, repeatable. |
| `--suite <name>` | Expand a named tag set from the config's `suites` key. One at a time, and not combinable with `--tag`. |

Tag selection **compiles to Playwright's own flags** and nothing else:

| You write | TestPilot runs |
|---|---|
| `--tag smoke` | `--grep "/(?<!\S)@smoke(?!\S)/"` |
| `--tag smoke,regression` | `--grep "/(?<!\S)@(?:smoke\|regression)(?!\S)/"` |
| `--tag '!slow'` / `--exclude-tag slow` | `--grep-invert "/(?<!\S)@slow(?!\S)/"` |

The compiled flags are printed on stderr, so a team dropping TestPilot can paste them into their own
CI. Two details of Playwright's matching drive that shape, both checked against its source:

- **The `/…/` wrapper is load-bearing.** Playwright compiles a *bare* `--grep` string as
  `new RegExp(pattern, 'gi')` — case-**insensitive**. A slash-delimited value is taken as an explicit
  regex with only the flags written after it. Without the wrapper, `--tag here` would also run
  `@HERE`, and `run` would select a different set than `tags` counts and `doctor` validates.
- **The boundaries are deliberately stricter than Playwright.** Playwright reads title tags with
  `/@\S+/` and would call `@smoke.example` in `user@smoke.example` a tag; `--tag` will not select it.
  That strictness is what makes `--tag smoke` skip `@smoketest` and `--tag team` skip `@team:auth` —
  the mistake hand-written `--grep` invites. `testpilot tags` flags every tag it cannot select — including one that only ever appears fused to a word, which Playwright reads as a tag and `--tag` cannot reach.

**Rules**
- Tag names must start with a letter, digit or `_` and contain no whitespace or `@`. Anything more
  exotic still works through `run -- --grep '<pattern>'`.
- A tag both included and excluded is a **usage error** (`2`), not an empty run.
- An unknown `--suite` is a **usage error** (`2`) that lists the suites that do exist. A typo must
  never fall through to running the whole suite.
- Combining `--tag`/`--suite` with a forwarded grep flag is a **usage error** (`2`): Playwright keeps
  only the last occurrence, so one of the two filters would be silently lost. Refused spellings:
  `--grep`, `--grep-invert`, `-g`, `-G`, `--flag=value`, short flags with an attached value
  (`-g@smoke`), and combined single-dash clusters (`-xg`, `-xg@foo` — commander parses these as
  `-x -g …`). Detection models Playwright's actual option table, so `-uchanged`
  (`--update-snapshots=changed`) is **not** refused despite containing a `g`.
- **One `--suite` at a time** (`2` otherwise). Two suites cannot be folded into a single
  include/exclude pair without changing what either selects: `{ fast: ['!slow'], nightly:
  ['regression'] }` would become "regression, excluding slow", which is neither suite.
- **`--suite` and `--tag` cannot be combined** (`2`). Both choose what to *include*, and "the
  nightly suite **plus** the smoke tests" and "the nightly suite **narrowed to** smoke" are equally
  natural readings. Rather than pick one silently, pick neither. `--exclude-tag` **does** compose
  with `--suite` — narrowing a suite is unambiguous. For an intersection, give the suite an `all`
  list.
- An **empty value** (`--tag ''`, `--tag ','`, `--suite ''`) is a **usage error** (`2`), never "no
  filter" — `--tag "$TAGS"` with an unset CI variable must not quietly run the whole suite.

**Behavior:** finds the project root (nearest `package.json`), loads `testpilot.config.ts` if
present, resolves the Playwright config (from `config.playwrightConfig` or discovery), invokes the
**local** `node_modules/.bin/playwright test`, forwards any args after `--` verbatim, and exits with
Playwright's own exit code.

| Situation | Exit code |
|---|---|
| Playwright's result | passes through (Playwright's code) |
| Invalid `testpilot.config.ts` | `3` |
| Playwright not installed locally | `4` (message: run `npm install`) |
| Bad tag/suite selection (unknown suite, malformed tag, `--grep` conflict) | `2` |

**Examples**
```bash
testpilot run
testpilot run -- --project=chromium
testpilot run -- tests/example.spec.ts
testpilot run -- --workers=2              # Playwright parallelism, passed straight through
testpilot run -- tests/ui --workers=2     # run only the UI tests, with 2 workers

testpilot run --tag smoke                 # tests tagged @smoke
testpilot run --tag smoke,regression      # either tag (any-of)
testpilot run --tag smoke --exclude-tag flaky
testpilot run --tag '!slow'               # everything except @slow
testpilot run --suite nightly             # a named set from testpilot.config.ts
testpilot run --suite nightly -- --workers=4
```

`testpilot tags` (§3.2a) lists what there is to select.

Parallelism is **Playwright's** (`fullyParallel: true` + `--workers`), not TestPilot's — `run`
forwards everything after `--` verbatim. The generated project must still run with plain
`npx playwright test`, and exposes `test:e2e`, `test:e2e:ui`, `test:e2e:api`, `test:e2e:parallel`,
and `test:e2e:headed` npm scripts.

---

### 3.2 `testpilot analyze` *(MVP)*

Run Locator Intelligence over test files. Read-only.
**Implemented:** Tier 1 static analysis with `--min-score` gating (MVP), the
`--baseline`/`--update-baseline` no-regression gate and `--output` (6A), and the `sarif` (6B) and
`html` (7A) reporters on top of `table`/`json`. **Still V2:** `--dom` (DOM-aware enrichment) and
`--changed` (diff scoping) — see tags below.

```
testpilot analyze [globs...] [options]
```

> **As implemented (Milestone 3B–3C):** the full MVP Tier 1 rule set runs —
> `no-xpath`, `no-css-class-selector`, `no-nth-child`, `no-deep-css-chain`,
> `prefer-user-facing-locator` (locator), and `no-hard-wait` (flakiness). Files come from the
> positional globs (a positional that is a **directory** is expanded into its test files, so
> `analyze examples/fragile-suite` works), else `config.include` resolved under `config.testDir`,
> which is relative to the **config file's directory** (see §7 — a run that matches nothing fails).
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
> Parse errors are reported but **do not** affect the score yet. See **[Scoring.md](Scoring.md)** for the
> full model with worked examples (pinned by a test).
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
> **Reporters & CI integration (6B, html in 7A):** **`--reporter <table|json|sarif|html>`** chooses the
> output format for both stdout and `--output`. `table` is the human report; `json` is the stable
> machine report; `sarif` emits a **SARIF 2.1.0** log so findings appear as GitHub code-scanning
> annotations at the exact file/line; `html` writes a **self-contained static HTML report** (inline
> CSS, no external assets, scripts, or tracking) for sharing/scanning. An unknown reporter exits **2**. Back-compat: with no `--reporter`, `--json` or a
> bare `--output` still imply `json`, and interactive runs default to `table`. SARIF results carry a
> `partialFingerprints['testpilotIdentity/v1']` equal to the baseline identity, so code scanning does
> not re-report a finding that merely moved lines. With `--baseline`, the **gate-facing `sarif` and
> `table` outputs are scoped to the new findings only** (matching what the gate fails on), while the
> **comprehensive `json` and `html` outputs stay whole** and carry the `baseline` summary. A composite **GitHub Action**
> (`faisal1024/testpilot-qa/action@v0`) wraps the CLI — it runs `analyze`, writes SARIF, and posts the
> human report to the job summary; it duplicates no analysis logic. Pair it with
> `github/codeql-action/upload-sarif` to publish annotations. The CLI works fully without GitHub.

| Option | Description | Default | Version |
|---|---|---|---|
| `--reporter <fmt>` | `table` \| `json` \| `sarif` \| `html`. | `table` | MVP / 6B / 7A |
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

### 3.2a `testpilot tags` *(Phase 10)*

List the **tag vocabulary** of the suite, statically. No browser, no Playwright process — the same
AST pass `analyze` uses. This is the discoverability half of tag-based running: `--grep` can filter,
but it can never tell you what there is to filter by.

```
testpilot tags [globs...] [--output <path>]
```

**Reads tags from both places Playwright does:** `@tag` tokens in a title, and the
`{ tag: [...] }` details argument. Tags on a `test.describe` are inherited by every test inside it,
including through nesting — the count reported is what `--grep` would actually select.

**Output (table):** one row per tag with the number of tests and files carrying it, sorted by count;
then the totals and the untagged count; then the configured `suites`, each resolved against the real
vocabulary.

Each row also records **how the tag was written** (`title`, `details`, or both). On a real suite this
is the difference between a vocabulary and noise: mattermost's `@abac` (122 tests) is declared with
`{ tag: [...] }`, while `@here`, `@all` and `@channel` come from titles *about* Mattermost's
@-mention feature. Playwright reads both as tags, so `run` treats them alike — the report should not.

**Honest bounds.** The vocabulary is a static read, so the report says where it is incomplete:

| Warning | Meaning |
|---|---|
| `dynamic-test-titles` | Titles built from a template literal. Text touching a `${...}` hole is not read at all, because it fuses with the hole at runtime — ``test(`@smoke${x}`)`` is the tag `@smokeX`, not `@smoke`. |
| `unreadable-tag-expressions` | A `tag` entry — or a whole details argument — that is a spread, a variable, or an interpolated template. Each is at least one tag the suite may carry and this list cannot name. |
| `unreadable-test-titles` | A `test()` or `test.describe()` title taken from a variable or expression, so no tag in it can be read. |
| `test-root-missing` | A declared test directory does not exist, so nothing under it was scanned. |
| `playwright-config-partial` | The adopted Playwright config was only partly readable, so the scanned file set may not match what Playwright runs. |
| `scan-restricted-to-patterns` | Explicit patterns narrowed the scan, so this is the vocabulary of that subset. `run --suite` always uses the whole suite. |
| `no-tests-recognized` | A parsed file declared no `test()` we recognized — usually a renamed import (`import { test as setup }`), which the walk keys on by name. "No tags" would otherwise answer a question that was never asked. |
| `describe-body-not-inlined` | A `test.describe` whose body is a variable or function reference. The tests inside it are declared elsewhere and cannot be read, nor can the block's tag reach them. |
| `playwright-config-tags` | The Playwright config declares a `tag` key (`testConfig.tag`), which it applies to every test in every file. Those values are not read here. |
| `unselectable-tags` | A tag `--tag` cannot select: the name contains a comma (split on) or leads with `-` (reads as a negation), or the tag only ever appears fused to a word (`user@smoke.example`), which Playwright reads as a tag and the leading boundary deliberately does not. `run -- --grep` reaches these. |
| `files-not-parsed` | Files that failed to parse contribute no tags. |
| `no-files-matched` | Discovery matched nothing. Exits `3`/`2` like `analyze` — "no tags" must never be the answer to "we scanned nothing". |

**`tests` counts `test()` declarations, not executed tests.** A `for` loop generating fifty tests is
one declaration. The rendered output says "test declarations" for this reason.

**Exit codes:** `0` on success; `2`/`3` when discovery matched no files (same rules as `analyze`).

**Example**
```bash
testpilot tags
testpilot tags --json
testpilot tags "e2e/**/*.spec.ts"
```

```
TAG              TESTS  FILES  DECLARED
@regression         86     14  details
@accessibility      55     10  details
@here                1      1  title

3 tag(s) across 153 test declarations in 28 file(s); 41 untagged.

Suites (testpilot.config.ts):
  nightly: any of @regression, excluding @flaky — 84 test declaration(s)
```

---

### 3.3 `testpilot fix` *(foundation in 8A; `--dom`/`-i`/`--rules` are V1 — deferred)*

Apply safe, **behavior-preserving, mechanical** rewrites to your test files. Mutates test code, so it is
**dry-run by default** and gated behind `--write`.

```
testpilot fix [patterns...] [options]
```

| Option | Description | Default | Status |
|---|---|---|---|
| `--write` | Write changes. Without it: dry-run unified diff only. | dry-run | **8A** |
| `--rules <ids...>` | Limit to specific rules. | all fixable | V1 |
| `--interactive`, `-i` | Approve each change. | off | V1 |
| `--dom <source>` | Use DOM context for concrete locator rewrites. | none | V2 |

> **Behavior (8A):** scans the same files as `analyze` (the `patterns`, or `config.testDir`/`include`).
> Dry-run prints a **unified diff** and writes nothing; `--write` applies. Fixes are **idempotent** and
> preserve line count. Only unambiguous, behavior-identical rewrites are made — today:
> **`x.locator('text=Foo')` → `x.getByText('Foo')`** (Playwright's string `getByText` does the same
> case-insensitive/trimmed/substring match as the `text=` engine). Quoted-exact (`text="Foo"`), regex
> (`text=/foo/`), chained (`>>`), dynamic (template), and unsafe-to-requote selectors are **left
> untouched**. It **never edits application code**, never calls an LLM, and **never** infers role/test-id
> locators from a string (that needs DOM evidence — see `--dom`, V2). Parse errors and unreadable files
> are skipped, never half-written. Unwritable paths exit **2**. `--json` emits
> `{ command:'fix', dryRun, files[], summary }`; `--quiet` prints nothing.

**Examples**
```bash
testpilot fix                       # preview diffs across the suite, write nothing
testpilot fix tests/login.spec.ts   # preview a single file
testpilot fix --write               # apply the safe rewrites
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
TestPilot project-structure (when scaffolded), **AI guidance-file drift** (5B), and **tag suites**
(Phase 10).

**AI guidance drift (`ai-guidance`):** for the agents selected by `config.ai.agents` (default: all),
checks each expected file (`CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`,
`.cursor/rules/testpilot-playwright.mdc`). State per file: `current`, `missing`, `edited`
(user-modified), `stale` (older marker version), or `no-marker`. **Detection only** — read-only,
deterministic, never regenerates or overwrites. Drift is a **warning, never a hard failure**, so it
does not by itself change the exit code. The structured per-file detail is in `check.details.files`.

**Tag suites (`suites`):** appears only when `testpilot.config.ts` declares a non-empty `suites`
map. A structurally broken suite (empty, or a malformed tag token) **fails**; a suite referencing a
tag no test carries **warns** — the tag may simply not be written yet. Verifying the second half
needs the tag vocabulary, so on a project with suites `doctor` performs the same AST pass as
`analyze` (roughly a second on a 300-file suite); a project without suites pays nothing. If the
vocabulary cannot be read the check says so rather than reporting every tag as valid.

**Output:** an overall status (`pass`/`warn`/`fail`), each check (`id`, `title`, `category`,
`status`, `message`, optional `remediation`, optional `details`), and deduped `nextActions`. `--json`
envelope:

```json
{
  "schemaVersion": "1.2",
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

The `ai-guidance` check runs only on a project that has a `testpilot.config.ts` (or with
`--strict-guidance`), so `doctor` on a repository you are merely evaluating does not report missing
guidance files it was never asked for. A `playwright-discovery` check appears only when a Playwright
config was found and could not be used for discovery, and a `suites` check only when suites are
configured — so `checks` is variable-length and consumers must key on `id`, never on position.

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
> are never clobbered by default. (A file is `stale` only after the bundled `GUIDANCE_VERSION` is
> bumped in a TestPilot release — until then a generated file is `current`.) `[agent]` is one id or
> `all`; omitted, it uses `config.ai.agents` (an empty list reports "nothing to regenerate" and exits
> 0). An unknown agent exits **2**. Writes are best-effort per file: a failure is reported and the run
> continues, exiting **2** at the end. `--json` emits `{ command:'add', resource:'ai', dryRun, files[], summary }`.

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
  include: ['**/*.spec.ts'], // default: ['**/*.{spec,test,e2e,e2e-spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']
  // default: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**', '**/test-results/**', '**/playwright-report/**']
  // Setting this REPLACES the defaults — repeat the ones you still want.
  exclude: ['**/node_modules/**', '**/dist/**'],
  scoring: { minScore: 80, weights: { error: 5, warn: 2, info: 0.5 } },
  rules: {
    // MVP rule set (see Locator-Intelligence-Design §5)
    'no-xpath': 'error',
    'no-nth-child': 'error',
    'no-css-class-selector': 'error',
    'no-deep-css-chain': 'warn',
    'prefer-user-facing-locator': 'warn',
    'no-hard-wait': 'error',
    'avoid-positional-access': 'warn',
    'avoid-parent-traversal': 'info',
    // Off by default — opt in once the suite has a tag vocabulary.
    'require-test-tag': 'info',
  },
  // Per-rule settings, separate from `rules` so a severity stays a severity.
  ruleOptions: {
    'no-deep-css-chain': { maxChainDepth: 3 },
  },
  // Named tag sets for `testpilot run --suite <name>`. A leading `!` excludes.
  // `doctor` warns when a referenced tag exists in no test, so a typo surfaces
  // instead of silently running zero tests.
  suites: {
    smoke: ['smoke'],
    nightly: ['regression', '!flaky'],
  },
  // rulePacks (external) is a V2 public-plugin feature — not configurable in MVP.
  ai: { agents: ['claude', 'cursor'] },
})
```

### `suites`

| | |
|---|---|
| Type | `Record<string, string[] \| { any?: string[]; all?: string[]; none?: string[] }>` |
| Default | `{}` |
| Used by | `testpilot run --suite <name>`, `testpilot tags`, `testpilot doctor` |

The **array form is any-of**: `['regression', '!flaky']` runs anything tagged `@regression` except
`@flaky`. The **object form** adds all-of, which an array cannot express:

```ts
suites: {
  nightly: ['regression', '!flaky'],
  hardened: { all: ['regression', 'critical'], none: ['flaky'] },
}
```

`all` compiles to one lookahead per tag in a single `--grep`. The object form is `.strict()`, so
`{ al: [...] }` is a config error rather than a suite that silently selects everything. The array
form is permanent sugar for `{ any: [...] }` — it will never be reinterpreted.

Suite names are best kept to letters, digits, `_` and `-`; anything else works but needs shell
quoting, which `doctor` **warns** about (never fails — the config runs correctly). An empty suite is
a `doctor` **failure**: it would select every test. A suite naming a tag no test carries is a
`doctor` **warning** (the tag may not be written yet) and is called out in `testpilot tags`.

---

## 5. Output Contract (`--json`)

Stable, versioned envelope so agents and CI can depend on it. The shape below matches the
**implemented `analyze` report (`schemaVersion` `1.9`)**. (DOM-derived suggestions remain out of Tier 1.)

```json
{
  "schemaVersion": "1.9",
  "command": "analyze",
  "rootDir": "/abs/path/to/project",
  "discovery": {
    "testDir": "playwright-config",
    "include": "playwright-config",
    "exclude": "default",
    "roots": ["/abs/path/to/e2e"],
    "playwrightConfigPath": "/abs/path/to/playwright.config.ts",
    "playwrightConfigIgnored": null,
    "playwrightConfigPartial": null,
    "playwrightConfigDeclaresTags": false
  },
  "summary": {
    "filesAnalyzed": 3,
    "helperFiles": 0,
    "filesWithParseErrors": 0,
    "findings": 9,
    "unscoredFindings": 0,
    "unscoredRuleIds": [],
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
      "message": "The CSS class selector .btn-primary is coupled to styling and changes frequently.",
      "file": "tests/login.spec.ts",
      "line": 3,
      "column": 14,
      "snippet": "page.locator('.btn-primary')",
      "suggestion": "Prefer getByRole() or getByTestId() over class-based selectors.",
      "docsUrl": "https://github.com/faisal1024/testpilot-qa/blob/main/docs/rules/no-css-class-selector.md"
    }
  ],
  "warnings": [
    { "code": "unknown-rule", "ruleId": "made-up", "message": "Unknown rule \"made-up\" in config — ignored." },
    { "code": "playwright-config-partial", "message": "…/playwright.config.ts was used for test discovery, but part of it could not be read: …" }
  ],
  "parseErrors": [{ "file": "tests/broken.spec.ts", "message": "..." }],
  "baseline": { "path": "testpilot-baseline.json", "newFindings": 1, "baselinedFindings": 8 }
}
```

`discovery` (1.5) says where each file-selection setting came from —
`testpilot-config` | `playwright-config` | `mixed` | `default` — plus the Playwright config that supplied them
(`playwrightConfigPath`) or the one that was found and could not be used
(`playwrightConfigIgnored: { path, reason }`). `roots` lists the absolute directories actually
scanned — a Playwright suite can declare several via `projects[]`, which no single `testDir` string
can represent, so every message that names a test directory renders these. `inHelper` (1.7) is present only on findings from the helper layer — absent, not `false`, otherwise.
`unscoredFindings` / `unscoredRuleIds` (1.9) count and name findings included in `summary.findings`
but excluded from the score. A rule declares this itself (`RuleMeta.scored: false`) — it is not a
property of the rule's kind, so a later test-level rule that *does* belong in the score is not
blocked by the abstraction. Today only `require-test-tag` is unscored: it is per **test**, while the
score's denominator is locator **call sites**, so scoring it would move the grade for a reason it
does not measure. The exclusion is named in `--json`, in the table (in every mode, including
`--baseline`), and in the HTML report — never applied silently. `warnings[].code` also gains `test-tag-coverage`, a one-line rollup that
reconciles the flagged count against `testpilot tags`.
`playwrightConfigDeclaresTags` (1.8) reports that the project's Playwright config declares a
`testConfig.tag`, which Playwright applies to every test — **or might, in a part of the config that
could not be read**. It is set whether or not that config was adopted for discovery (a tag applies
either way), so it can be `true` alongside `playwrightConfigIgnored`. `tags` cannot claim a complete vocabulary while that is open, and
`require-test-tag` abstains: until it is ruled out, no test in the suite can be called untagged.
`rootDir` (1.4) is the absolute directory that `findings[].file` / `parseErrors[].file` are relative
to: the config file's directory (or the project root when there is no config file) for config-driven
discovery, `--cwd` for explicit patterns. It is the one machine-specific field in the envelope — the
findings, score, and baseline identities are not — so snapshot comparisons across machines should
ignore it.
`warnings[].code` is `unknown-rule`, `no-files-matched` (1.4), or — new in **1.6** —
`playwright-config-partial` / `playwright-config-ignored`, so a discovery problem reaches the table,
the HTML report, and SARIF (as `invocations[].toolExecutionNotifications`), not just stderr. On a **zero-file run** the `--json`
and `--reporter sarif` outputs are still emitted (`filesAnalyzed: 0`, the `no-files-matched` warning,
no results) *before* the CLI exits `2`/`3`, so agents and `upload-sarif` steps with `if: always()`
still have something to read; the table and HTML reporters print only the error.

`baseline` is present **only** when the run used `--baseline`; it reports the comparison summary
against the saved baseline. Findings are sorted by `(file, line, column, ruleId)`, so the report is
deterministic and diffable.

### `tags --json` (`schemaVersion` `1.0`)

```json
{
  "schemaVersion": "1.0",
  "command": "tags",
  "rootDir": "/abs/path/to/project",
  "discovery": { "…": "same shape as analyze" },
  "summary": {
    "filesAnalyzed": 28,
    "filesWithParseErrors": 0,
    "tests": 153,
    "taggedTests": 112,
    "untaggedTests": 41,
    "distinctTags": 3,
    "dynamicTitles": 2,
    "unreadableTagExpressions": 0,
    "unreadableTitles": 0,
    "describesNotInlined": 0,
    "vocabularyComplete": false
  },
  "tags": [
    { "tag": "regression", "tests": 86, "files": 14, "sources": ["details"], "selectable": true }
  ],
  "suites": [
    {
      "name": "nightly",
      "include": ["regression"],
      "all": [],
      "exclude": ["flaky"],
      "unknownTags": [],
      "unknownExcludedTags": [],
      "matchingTests": 84
    }
  ],
  "warnings": [{ "code": "dynamic-test-titles", "message": "…" }],
  "parseErrors": []
}
```

Tag names are stored **without** the leading `@`. **`summary.vocabularyComplete`** is the single flag
every consumer keys on — `tags`, `doctor`, and the suite counts — so they cannot drift apart and
disagree about whether a tag exists. It is `false` whenever anything above means the read fell short
of the truth.

`matchingTests` is `null` when no honest count exists: the suite references a tag we did not find,
is malformed or empty (either would match every test), or the vocabulary is incomplete. A count over
a vocabulary we know is wrong would be worse than no count. Counts are over **selectable**
occurrences, so they never promise more tests than `--tag` can reach. `warnings[].code` is its **own** union for this command (`no-files-matched`,
`test-root-missing`, `playwright-config-partial`, `dynamic-test-titles`,
`unreadable-tag-expressions`, `no-tests-recognized`, `unselectable-tags`); `analyze`'s
`AnalysisWarning` union is deliberately unchanged — the two commands' warning codes do not mix.

**SARIF (`--reporter sarif`)** is a derived view of the same findings, not a second contract: each
distinct `ruleId` becomes a SARIF reporting descriptor (with its `helpUri`), and each finding becomes a
result whose `level` maps from severity (`error`→`error`, `warn`→`warning`, `info`→`note`) at its
`physicalLocation` (file URI + 1-based line/column + snippet). SARIF file URIs are always relative to
**`--cwd`** (re-resolved from `rootDir`), so the GitHub Action's "run from the repo root" contract
holds even when `testpilot.config.ts` lives in a sub-package. Each result carries
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

**A run that matches zero test files is never a pass.** `analyze`, `fix` and `tags` exit `2` when explicit
patterns match nothing and `3` when config-driven discovery (`testDir` + `include`) matches nothing,
printing what was searched (a **directory** argument that matches nothing is a `3` too — it is
expanded with the config's `include`). The default `include` is
`['**/*.{spec,test,e2e,e2e-spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']`, and the default `exclude` skips
`node_modules`, `dist`, `build`, `coverage`, `test-results`, and `playwright-report`. `exclude` applies
wherever `include` chose the files (config-driven discovery and directory arguments); a glob or path
you name explicitly is honored as written, so `analyze dist/e2e/a.spec.js` still works.

`testDir` is resolved relative to the directory of the loaded `testpilot.config.ts` — or, when there is
no config file, the **project root** (nearest `package.json`), which is the same base `doctor` checks —
so running from a sub-directory of a monorepo still finds the suite.

### Page objects, fixtures and helpers

Playwright's `testMatch` selects the files it *runs*. Real suites keep most of their locators
somewhere else — Ghost's page objects hold 114 of its 116 findings — so `analyze`/`fix` accept
`--with-helpers`, or a `includeHelpers` list in `testpilot.config.ts` (naming them is itself the
opt-in). Defaults when the flag is used: `pages`, `page-objects`, `pageobjects`, `pom`, `fixtures`,
`helpers`, `support`. `lib/` and `utils/` are deliberately absent — broad enough that scanning them
costs more than it returns; a suite that keeps page objects somewhere else entirely should name its
own `includeHelpers` list.

These files are scanned from the **config's directory**, not from `testDir` — helpers sit beside the
test root far more often than inside it. Findings carry `inHelper: true`, are counted in
`summary.helperFiles`, and are marked `[helper]` in the table, in the HTML report, and as a SARIF
`properties.inHelper`. "Your page object uses a CSS class" is a different conversation from "your test
does" — a page object centralizing a selector is doing its job — so the two are never merged silently.

Safeguards, because this is the one path that reads files Playwright does not:

- A directory name is only a hint. `pages/` is Next.js's and Nuxt's route directory and `helpers/` is
  Ember's, so a candidate must **also carry evidence of Playwright**: an `@playwright/test` import, a
  `Locator` reference, or a `.locator(` / `.frameLocator(` / `.waitForTimeout(` call on *any* receiver.
  `getBy*` and `.nth(` count too, but only when nothing in the file claims them for Testing Library —
  an RTL helper produces no findings while adding call sites, and call sites are the score's
  denominator, so admitting one can move a failing `--min-score` to passing. The gate never keys on a
  receiver named `page`: page objects hold the handle as `this._page`, `this.root` or `adminPage` at
  least as often. Without this gate, `fix --write` would rewrite application source.
- When helper directories match but nothing in them uses Playwright, the run says so
  (`helpers-not-recognized`) rather than reporting an empty helper layer as an absent one.
- Symlinked *helper* directories cannot take analysis — or `fix --write` — outside the project. A
  symlinked **test** root is trusted, since workspace tooling legitimately creates those.
- **Helpers never rescue a failed run.** If the test scan matched nothing, the run still fails —
  scoring the helper layer alone would turn a wrong `testDir` from a red gate into a green one.
- A file the suite already selected as a test stays a test, even when it sits under `helpers/`.
- Explicit CLI patterns already say what to analyze, so `--with-helpers` is reported as ignored there
  rather than silently doing nothing.
- Baselines are not comparable across the flag: turning it on makes every helper finding new. Record
  a baseline with the same setting you gate with.

It is **off by default**: a score that quietly included files Playwright never runs would not be
comparable to one that didn't.

### Playwright-config fallback

When `testpilot.config.ts` does not set `testDir` (or does not exist), TestPilot reads `testDir`,
`testMatch`, and `testIgnore` from the project's `playwright.config.*` — including entries under
`projects[]`, and `RegExp` matchers, which are applied to absolute paths exactly as Playwright applies
them. If the root has no Playwright config, one first-level sub-directory is checked (real suites keep
it in `e2e/`); an ambiguous result adopts nothing.

- **Every** `projects[]` entry becomes its own scope: a root plus the `testMatch`/`testIgnore` that
  apply **to it**, inheriting the top-level values it doesn't set — including projects that declare no
  selectors at all, as in Playwright's documented `setup` pattern. One project's `testIgnore` can
  never delete another project's files. A project whose `testDir` is computed is skipped rather than
  silently scanned at its parent's root.
- An explicit `include` outranks Playwright's `testMatch`, exactly as an explicit `testDir` does.
  `exclude` and `testIgnore` are **both** applied — they are not competing definitions of one thing,
  and adding one exclusion never means "also run the suite Playwright skips". The provenance is then
  reported as `mixed`.
- Playwright's `testMatch`/`testIgnore` — globs **and** RegExps, with their flags — are matched
  against the **absolute** path, as Playwright matches them. TestPilot's own `include`/`exclude` keep
  their documented root-relative meaning.
- A config in a **sub-directory** that declares no `testDir` contributes that directory (Playwright's
  default test root) when it demonstrably holds test files — so a minimal `e2e/playwright.config.ts`
  points discovery at `e2e/`, while an `examples/` config does not hijack it. A bare config at the
  project root is reported rather than adopted.
- `defineConfig(base, override)` is merged **per key with later arguments winning**, as Playwright
  merges them. A layer that could not be read is reported, and no test root is synthesized from a
  partly-read config — defaulting to the config's own directory would scan the whole project.
- Only `defineConfig`/`mergeConfig` calls are unwrapped. A project-local wrapper
  (`makeConfig({...})`) can rewrite what it is given, so its argument is reported as unreadable
  rather than trusted.
- Anything the parse can't resolve — a computed value, a spread, a `projects` array built by a
  function — is reported. The config is still used for what *was* readable, and `discovery`
  distinguishes "partially read" (`playwrightConfigPartial`) from "not used" (`playwrightConfigIgnored`).
- `node_modules` is **always** skipped, whatever `exclude` says.
- The config is **parsed, never executed.** `analyze` is static and offline, and is routinely pointed
  at a repository the user is only evaluating. A value that isn't a literal (`testDir: process.env.DIR
  ?? 'e2e'`) is reported as unusable rather than guessed at, and named in the zero-file error and by
  `doctor`.
- `testDir` and `testMatch` are adopted **as a pair** — taking one without the other produces a
  selection neither tool would make.
- An explicit TestPilot `testDir` always wins; `testIgnore` and `exclude` are both applied.
- Whenever the fallback supplies a setting, `analyze`/`fix` say so on stderr (unless `--quiet`).
**Known limitations.** A partial read always **widens**, never narrows: when part of a config is
invisible (a spread, a `projects` array built by a function), discovery falls back to the config's own
directory — the superset the hidden entries can only be inside — so the score may include files
Playwright does not run. That case is always reported as `playwright-config-partial`. Where Playwright
declares `testDir` and no `testMatch`, TestPilot's default `include` is a superset of Playwright's
default `testMatch` (it also picks up `*.e2e.ts`, `*.e2e-spec.ts`, and JS suffixes); provenance then
reads `default`. And `doctor` checks that the resolved roots *exist*, not that they contain matching
files, so an empty test directory passes `doctor` and still exits `3` under `analyze`.

- `--no-playwright-discovery` turns the fallback off, for `analyze`, `fix`, and `doctor` alike.
  Explicit CLI patterns skip it automatically, as does an explicit `testDir` in `testpilot.config.ts`.
- `rootDir` is a pure function of repo layout, never of the roots discovery resolves — it is the
  baseline identity anchor, so adding an unrelated `projects[]` entry can't rewrite existing findings'
  paths. A test root outside the project is reported honestly with `../`, and the SARIF reporter emits
  an absolute `file://` URI for it (code scanning rejects `..` and would drop the whole upload).

---

## 8. Command Surface

### 8.1 Current command surface (implemented)

What exists today — see the per-command sections above for details:

| Command | Status | Summary |
|---|---|---|
| `testpilot init` | MVP (2.5) | Scaffold a TypeScript Playwright project + AI guidance files. |
| `testpilot run` | MVP (2.5) + Phase 10 | Thin pass-through to the project's local Playwright; `--tag`/`--exclude-tag`/`--suite` compile to `--grep`/`--grep-invert`. |
| `testpilot tags` | Phase 10 | Static tag vocabulary with per-tag counts, untagged count, and suite resolution. |
| `testpilot analyze` | MVP + 6A/6B/7A | Static Tier 1 analysis; `--min-score` gate; `--baseline`/`--update-baseline` no-regression gate; `--output`; `--reporter table\|json\|sarif\|html`. |
| `testpilot fix` | 8A | Safe, behavior-preserving mechanical rewrites. **Dry-run by default; `--write` to apply.** Not DOM-aware, not broad auto-fix. |
| `testpilot add ai` | 6C | Regenerate AI guidance files (dry-run by default; `--write`/`--force`). Other `add` subcommands remain V1. |
| `testpilot doctor` | MVP (4B) + 5B | Project-readiness diagnostics + AI guidance drift. |
| `testpilot explain` | MVP (4A) | Explain a rule with bad/good examples. |

Brownfield "snapshot only-new-issues" adoption is delivered by **`testpilot analyze --baseline` /
`--update-baseline`** (6A) — there is no separate `testpilot baseline` command planned.

### 8.2 Future roadmap

| Command | Version | Purpose |
|---|---|---|
| `testpilot score --watch` | V1 | Live quality score in the terminal during development. |
| `testpilot review` | V1 | Emit findings as a GitHub PR review/annotations (pairs with the Action). |
| `testpilot add` (`ci`/`template`/…) / `testpilot list` | V1 | Layer further capabilities / discover templates & rules (`add ai` already shipped in 6C). |
| `fix --dom` / `fix -i` / `fix --rules` | V1+ | Extend the existing `fix` with interactive approval, rule filters, and (V2) DOM-backed rewrites. |
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
