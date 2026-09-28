# Road to Beta

> **Status:** active plan, adopted 2026-09-28. Supersedes [`Post-Alpha-Plan.md`](Post-Alpha-Plan.md),
> which stays as the record of Phases 9–11. Each item is marked ✅ with its PR number as it merges,
> and a workstream heading gains **— complete** when its exit criteria hold.

## 1. Where we are

**Published:** `testpilot-qa@0.1.0-alpha.2` (npm `alpha` and `latest`), which carries Phases 9–11 of
the previous plan. `0.1.0-alpha.1` was versioned but never published.

**On `main`, unreleased (#86 and today's dependency bumps), shipping as `alpha.3`:**
- `prefer-get-by-test-id` names a rewrite only for shapes it can prove. The combinator axis and the
  pseudo-class axis are both allowlists now, and the `data-testid=` engine is bounded the same way.
  Checked in real Chromium, with 0 wrong rewrites across the shapes that broke it before.
- A usage error exits `2` and an internal error exits `5`, as documented. Before, both exited `1`, the
  gate-failed code.
- `use.testIdAttribute` is read from the Playwright config.
- The README was corrected claim by claim.
- The `@typescript-eslint/parser`, `lint-staged`, `yaml`, `@types/node`, `actions/cache` and
  `actions/upload-artifact` bumps.

**Waiting:** [#104](https://github.com/faisal1024/testpilot-qa/pull/104), the `alpha.3` Version PR.
It must not merge until workstream **A** lands.

This plan comes from four independent reviews run against `main` on 2026-09-28:
- the published CLI surface
- analysis correctness and how it is tested
- the old plan and every published number
- a final re-review of #86

Figures below marked *(review)* were measured by those reviews at `3e082b3`. Each is re-measured by
`pnpm bench` before any release note quotes it.

## 2. What the last phase taught us

These are the reasons for the plan's shape, not background.

1. **One defect class keeps coming back.** It is "the same locator written two ways gets two
   answers". `prefer-get-by-test-id` needed eleven review rounds, and each fix closed one spelling
   and left an equivalent one open. The fix that held was changing *how* it reasons, from a list of
   unsafe shapes to an allowlist of safe ones, and **checking against a real browser**.
2. **The corpus cannot see correctness bugs.** The last seven defects had zero corpus incidence.
   Replaying all 257 corpus rewrites passes on both the broken and the fixed rule *(review)*. The
   benchmark proves the analyzer read the suite. It does not prove the analyzer was right. That needs
   a browser oracle and generated inputs (workstream **D**).
3. **Published numbers drift when they are typed.** About ten published figures were wrong, each
   caught later by a recount. Every one was typed by hand from a probe script. The fix is structural:
   generate the numbers from the measurement, with a test that fails on drift (workstream **C**).
4. **Check exit codes, not output.** A gate one-liner (`pnpm -s lint | tail -1`) printed a blank line
   for a failing lint. The gate is now scripted to test exit codes.
5. **The release path is part of the product.**
   - `release.yml` publishes without running the test suite.
   - The `alpha` tag sat on the wrong build for three weeks.
   - A Version PR merged while a newer changeset was pending, so `alpha.1` was never published and its
     notes reached no GitHub release.

## 3. Principles

- **Allowlists over blocklists** wherever a rule makes a claim. An unrecognised shape means silence.
- **Every factual sentence a rule prints must be checkable**, by a browser oracle where it is about
  the DOM, and by a test where it is about the code.
- **Numbers in docs are generated**, never typed. Historical figures carry an `as-of` fence.
- **Zero evidence is never a pass.** No files, no parsed files, no call sites, or no readable
  selectors all mean a `null` score, never `100 (A)`.
- **One breaking release for the score**, carrying every denominator change at once, not spread
  across alphas.
- Unchanged: static and offline, ejectable, every PR reviewed and gated, changesets for user-facing
  changes.

## 4. Workstreams

They are listed in dependency order. A and B come before anything else ships. C and D can run in
parallel. F waits on E and on decisions **D2–D4**.

### A — Release safety (blocks #104 / `alpha.3`)

| # | Item | Why |
|---|---|---|
| A1 | **Release job:** Node 22; `needs:` a job running the full gate (lint, typecheck, test, build, `smoke:mvp`, `smoke:package`, `changeset status`); publish with an **explicit `--tag`** read from `.changeset/pre.json` instead of relying on `changeset publish`'s fallback to `latest`. | Trusted publishing needs Node ≥ 22.14. Today the job publishes untested code. The fallback is what left `alpha` on `alpha.0`. With trusted publishing, CI cannot run `npm dist-tag` to repair it afterwards. |
| A2 | **Refuse to open a Version PR while the current version is not on npm.** | Stops a repeat of the lost `alpha.1`. |
| A3 | **PR CI on Node 22 + 24**, and it also runs `smoke:package` and `changeset status`. | Node 20 reached end of life in April 2026. Neither check runs on PRs today. |
| A4 | **Verify the first trusted publish.** `alpha.3`'s `_npmUser` must be the GitHub Actions identity. Then the owner sets *"require 2FA and disallow tokens"* and deletes `NPM_TOKEN`. | npm is restricting bypass-2FA tokens for publishing. |
| A5 | **Repair the `alpha.2` GitHub release notes.** They contain only #84, so Phases 9–11, including the breaking nullable score, appear in no release. | The owner approves the text; editing a published release is outward-facing. |

**Exit:** `alpha.3` published through trusted publishing with provenance, under the intended tag
(decision **D1**), from a job that ran the full gate.

### B — Correctness bugs on the published surface

Each item is one PR with a reproduction test.

| # | Defect | Source |
|---|---|---|
| B1 | **The Action lets bash glob-expand `patterns`.** An unquoted `${TP_PATTERNS}` turns `tests/**/*.spec.ts` into a subset. The score and baseline gate cover files nobody chose, silently. One-line fix. | surface P1 |
| B2 | **`includeHelpers` never matches a relative glob** (`pages/**`), because it is matched against absolute paths. Setting it also *replaces* the defaults, so `--with-helpers` then analyzes zero helpers. The documented way to opt in does nothing. Also: warn when an entry matches nothing. | surface P1, independently reproduced |
| B3 | **`init` in an existing Playwright project turns a failing gate green.** It hard-codes `testDir: 'tests'` and adds sample tests, so the real suite is no longer analyzed. A score of 0 becomes 100. Needs a detect-and-augment mode, or refuse without `--force`. | surface P1 |
| B4 | **`run` resolves a different Playwright config** than `tags`, `analyze` and `doctor` (root only vs one level down). | surface P1 |
| B5 | **Zero evidence reads as a pass:** `--min-score ""` is parsed as 0; all files failing to parse gives `100 (A)`; a zero-file `--json` report says `100/A`; parse errors never reach SARIF. | surface P1/P2 |
| B6 | **`no-xpath` misses XPath outside the first `>>` part** (`.row >> xpath=//td` is silent, while `.locator('xpath=//td')` is an error). The engine is decided by a string prefix instead of the tokenizer's parts: two programs, two answers. | analysis P2 |
| B7 | **The tokenizer splits `>>` chains differently from Playwright.** It ignores backslashes and counts parens inside `text=` bodies, so `text=a\>> .btn` gives a false `no-css-class-selector` error. | analysis P3, a false finding |
| B8 | **Scoring weights accept nonsense.** With `error: 0`, one `info` finding scores `0 F`. Require positive weights with `error ≥ warn ≥ info`. | analysis P3 |
| B9 | **Stray extra arguments are silently accepted** (`doctor extra junk` exits 0), and `--cwd /missing` exits 3 rather than 2. | surface + #86 re-review |

**Exit:** each has a regression test that fails on `main` before its fix.

### C — Truth by construction

| # | Item |
|---|---|
| C1 | `bench/baseline.json` becomes the **only** source of corpus figures: per-severity, per-rule-kind, with-helpers, `fix` counts, tags summary, uninspected by AST node type. `reason` becomes an append-only `history[]`, because a single overwritten field cannot hold a correction record. |
| C2 | `pnpm docs:corpus` fills `<!-- corpus:begin id=… -->` blocks in the README, the npm README, Scoring, CLI-Spec and the rule pages from the baseline. A test re-renders them and fails on any byte difference. |
| C3 | The flag, option and exit-code tables in both READMEs and CLI-Spec are **generated from the Commander program and `exit-codes.ts`**, with a drift test. The README's install version comes from `package.json`. This removes the documented-but-nonexistent `--severity` / `--rules`. |
| C4 | **Released changesets are immutable.** A test fails if a changeset listed in `pre.json` changes after release. (#86 edited one before review caught it; that correction would never have shipped.) |
| C5 | README and npm-page sample output is **generated by running the built CLI** on `examples/fragile-suite` and a fresh `init` project. |
| C6 | Correct every stale published claim the audit listed, after C1–C3 so the numbers are generated rather than retyped. **The npm page (`packages/cli/README.md`) goes first**: it is the most-read artifact and has never been updated since `alpha.0`. |

**Exit:** changing a measured number without regenerating the docs fails CI.

### D — A browser oracle for every claim a rule makes

| # | Item |
|---|---|
| D1 | `testIdReplacement` returns a **structured rewrite** carrying tokenizer source offsets (`[{getByTestId: v}, {locator: text}]`), and the message is rendered from it. Today any checker has to re-derive "the rest of the selector" with string surgery, the same hand-reasoning that kept being almost right. |
| D2 | **Oracle job** (Chromium via the existing `playwright-core` dev dependency, path-filtered to `src/selector` and `src/rules`). It replays every historical defect shape and every corpus rewrite, and checks **each sentence** a finding prints: *same elements*, *every target has a test-id ancestor*, *the rewrite is a widening*. It builds witness DOMs from the selector so no check passes vacuously, then mutates them. |
| D3 | **Allowlist meta-test:** every entry in `SCOPE_INDEPENDENT_PSEUDOS` / `COMPOUND_ARGUMENT_PSEUDOS` must have a non-vacuous oracle witness. Stateful pseudo-classes (`:hover`, `:focus`, `:checked`) have their state driven, or are dropped until proven. |
| D4 | **Generative fuzzing:** a selector grammar with shrinking and a fixed seed on PRs (about 1,000 selectors, about 40 s) and a random seed nightly (about 20,000). Its first run found six defect families that were not on the historical list *(review)*. |
| D5 | **Structural tokenizer differential** against Playwright's own `parseSelector`: part split, engines, list arity, combinators. Under 1 s, on every PR. The current test only compares accept/reject. |
| D6 | **Equivalent-spelling property tests for every rule.** The reviews found these pairs disagreeing: `li:nth-child(1)` / `li:first-child`; `.btn` / `[class~="btn"]`; `a b c d` / `a >> b >> c >> d`; `text=Save` / `:text("Save")`; `.nth(0)` / `>> nth=0`; `getByTestId('row').locator('td')` / `locator('[data-testid=row] >> td')`. Each rule gets a table of pairs Chromium confirms equivalent, and must give both sides the same answer. |

**Exit:** D2 and D5 run on every PR that touches the analyzer, and D4 runs nightly. Estimated about
1–1.5 weeks *(review)*.

### E — Make quality measurable

| # | Item |
|---|---|
| E1 | A **labelled sample** in `bench/labels.json`, keyed by baseline identity: 60 per `warn`/`error` rule, 150 for `no-css-class-selector`, and all `no-xpath` findings, about 330 in total. Each label is `tp` / `hard-fp` / `judgement` with a one-line rationale. A test reports the Wilson upper bound per rule and fails on label rot. This is what turns the old plan's "< 5% false positives" into something measured. |
| E2 | `examples/fragile-suite` becomes a **sixth bench entry**, so `no-nth-child` and `no-deep-css-chain`, which have zero corpus findings, still get a "went silent" gate. |
| E3 | A **ranking** of findings (severity, then confidence), so "the top ten findings" exists for the beta's qualitative gate. |

### F — Score 2.0 (replaces the old Phase 12)

The old Phase 12 does not do what its goal says. Its bullets (deduplicate per call site, and exclude
uninspected sites from the denominator) move corpus scores by about one point *(review)*. Its goal
("share of inspected call sites with an actionable problem") is a different formula. Worse, the unit
is wrong today: `.nth()` and `waitForTimeout()` are call sites of their own, so replacing
`page.locator('#save').nth(0)` with `getByRole(…)` **lowers** the score (18 → 12) *(review)*.

One breaking release, report schema **2.0**, containing:
- **The unit is a locator chain**, and hard waits are a separate count. A property test asserts that
  fixing a finding never lowers the score.
- **Denominator:** inspected chains only. Add `.first()` / `.last()`, and the **243**
  `page.click('selector')`-style calls no rule reads today *(review)*. That is about 17% extra call
  sites on cal.com, and none of them is currently scored.
- `null` for zero files, zero parsed files, and zero inspected chains.
- Remove the always-100 Accessibility and Maintainability sub-scores. Flakiness becomes a count, not a
  share of locator calls.
- The formula, the `prefer-get-by-test-id` severity and the helpers default are decisions **D2–D4**.
- Corpus projections re-measured before merge. `docs/Scoring.md` is generated from them (C2).

### G — `fix` that earns its place (replaces the old Phase 13)

- Rewrite what D1 proves exact: about **424** corpus findings *(review)*, or about 441 with helpers.
  That is 414 direct exact matches plus 10 through the engine. The old "574" predates 11b.
- Every rewrite is gated by the D2 oracle, and `fix`'s own `text=` → `getByText` rewrite is added to it.
- `fix --check` exits 1 when fixes are available, for CI. `fix --report` emits the `analyze` JSON shape.
- The planned `role=` → `getByRole` rewrite is **dropped**: since 11b, no rule fires on `role=`, so it
  would remove zero findings.

### H — Adoption surface (P2s from the surface review)

- **`add ai`**
  - writes relative to the working directory while `doctor` checks the project root;
  - CRLF checkouts make every guidance file read as "user-edited";
  - `--force` replaces a hand-written `CLAUDE.md` wholesale. Use a managed `<!-- testpilot:start/end -->`
    block instead.
- **SARIF**
  - file URIs are not percent-encoded, which breaks on Next.js `[id]` paths;
  - a rule's descriptor text comes from one finding instead of the rule's metadata.
- **`run`** swallows Playwright's own `--config` and `-q` (use `passThroughOptions`).
- **`--update-baseline`** ignores `--json` / `--reporter` / `--output`.
- **Discovery and config**
  - hoisted workspaces are reported as "Playwright not installed";
  - `doctor` passes where `analyze` fails, because it doesn't count discovered files;
  - a config load error hides its cause, and the documented `import { defineConfig } from 'testpilot-qa'`
    fails under `npx`;
  - `init` reads the *parent* directory's config;
  - read `path.join(__dirname, 'e2e')` and same-file spreads statically.
- **JSON:** a `gate` block, a per-finding `baselined` flag, and the tool version.
- **Action:** `config`, `with-helpers` and `args` inputs, and a default `version` that matches D1.

### I — Front door (remainder of the old Phase 14)

- Rewrite the npm README from generated sections (C2, C3, C5).
- A "**Why not just `eslint-plugin-playwright`?**" section.
- `docs/Configuration.md`.
- Owner-side: repository topics and Discussions.

### J — Dependencies and platform

| # | Item |
|---|---|
| J1 | Release plumbing **together**: #41 `setup-node` 7, #57 `changesets/action` 2, #100 `@changesets/cli` 3. Verify by `workflow_dispatch` with `PUBLISH_ENABLED=false` and a scratch `changeset version` diff. PR CI cannot see this path at all. |
| J2 | zod 4 (#101): `.default({})` → `.prefault({})`. A runtime dependency, so it needs a changeset and a green bench. |
| J3 | Biome 2 (#103): `biome migrate`, in an isolated PR. |
| J4 | The `engines` floor, the Action's default `node-version`, and `.nvmrc` follow decision **D6**. Move `auto-install-peers` out of `.npmrc`. |

## 5. Beta gate

Beta ships when **all** of these hold:
- A, B, C, D and F are complete.
- The labelled false-positive upper bound is **below 5%** for every `warn`/`error` rule (E1).
- The oracle and fuzzer have run green for two weeks.
- Scores are monotonic: fixing a finding never lowers the score (property test in F).
- Every number in every published doc is generated (C).
- The top ten findings are agreed by someone who maintains a real Playwright suite (E3).

Then `changeset pre exit`, and a `latest` policy per decision **D1**.

## 6. Decisions for the owner

| # | Decision | Recommendation |
|---|---|---|
| D1 | **Which dist-tag CI publishes to.** Trusted publishing can publish under one tag but cannot run `npm dist-tag`, so only one tag moves per release. | Publish prereleases to **`alpha`**. Make `alpha` the Action's default. `latest` moves only on a deliberate promotion (manual, with 2FA), which is the usual npm convention for prereleases. *A1 is built this way unless you say otherwise.* |
| D2 | **Score formula for 2.0:** a deduplicated weighted penalty (moves about 1 point) or the **share of inspected chains with a `warn`/`error` finding** (cal.com about 62). | The share. It is what the old goal described, and it reads plainly ("62% of your locators are clean"). It is a breaking change, so it lands inside the alpha banner. |
| D3 | **`prefer-get-by-test-id` severity.** `locator('[data-testid=x]')` is exactly as fragile as `getByTestId('x')`; as `warn` it opens a 40-point gap *(review)* between identical suites. | `info` in 2.0, with `fix` resolving it. The gate should measure fragility, not spelling. |
| D4 | **Page-object analysis on by default** (overdue since 9c). Scores move by at most 2 points *(review)*. | On by default in 2.0, after B2 fixes `includeHelpers`. |
| D5 | **The labelling budget** (E1, about 330 labels): who labels. | I pre-label with a rationale for each; you audit a random 10%. |
| D6 | **Node floor** now that Node 20 is end-of-life. | CI on 22 + 24 now; `engines >= 22` at beta. |
| D7 | **When to remove the `prefer-user-facing-locator` alias.** | At `1.0`, not before. |

## 7. Order of work

1. **A1–A3.** Then #104 can merge, and A4 is verified on that publish.
2. **B1–B9**, as small PRs. Each is independently releasable in `alpha.4`.
3. **C and D in parallel.** C first where it overlaps with docs corrections (C6).
4. **E**, then **F** (after D2–D4 are decided), then **G**.
5. **H, I and J** fill in between, with J1 right after a release so any failure costs nothing.
