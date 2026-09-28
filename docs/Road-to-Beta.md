# Road to Beta

> **Status:** active plan, adopted 2026-09-28. Supersedes [`Post-Alpha-Plan.md`](Post-Alpha-Plan.md),
> which stays as the record of Phases 9–11 (§8 lists what this plan carries over from it and what it
> drops). Each item is marked ✅ with its PR number as it merges, and a workstream heading gains
> **— complete** when its exit criteria hold. **Decisions D1–D7 (§6) are decided**, as recommended.

## 1. Where we are

**Published:** `testpilot-qa@0.1.0-alpha.2` (npm `alpha` and `latest`), which carries Phases 9–11 of
the previous plan. `0.1.0-alpha.1` was versioned but never published.

**On `main`, unreleased (#86 and today's dependency bumps), shipping as `alpha.3`:**
- `prefer-get-by-test-id` names a rewrite only for shapes it can prove. The combinator axis and the
  pseudo-class axis are both allowlists now, and the `data-testid=` engine is bounded the same way.
  The six pseudo-class shapes that broke it, and seven common shapes it still rewrites, were checked
  **by hand** in real Chromium: the six are no longer rewritten, and the seven select identical
  elements. Nothing replays them in CI yet; that is workstream **D**.
- An error Commander itself rejects (unknown flag or command, missing option value) exits `2`, and an
  internal error exits `5`, as documented. Before, both exited `1`, the gate-failed code.
  (`--min-score abc` already exited `2`.)
- Reading `use.testIdAttribute` (shipped in alpha.2) is now conservative: a config layer TestPilot
  cannot read (an imported base, a spread, a computed key) gives `"unresolved"` instead of asserting
  Playwright's default.
- The README was corrected claim by claim.
- The `@typescript-eslint/parser` bump, the only runtime dependency among today's bumps. The others
  (`lint-staged`, `yaml`, `@types/node`, `actions/cache`, `actions/upload-artifact`) don't ship.

**Waiting:** [#104](https://github.com/faisal1024/testpilot-qa/pull/104), the `alpha.3` Version PR.
It must not merge until A1 and A3 land, and then only in the order in
[RELEASING.md](../RELEASING.md#merge-order-around-a-version-pr).

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
2. **The corpus cannot see correctness bugs.** The seven defects fixed after #84 had zero corpus
   incidence. Replaying the corpus's own rewrites passes on both the broken and the fixed rule
   *(review)*. The
   benchmark proves the analyzer read the suite. It does not prove the analyzer was right. That needs
   a browser oracle and generated inputs (workstream **D**).
3. **Published numbers drift when they are typed.** About ten published figures were wrong, each
   caught later by a recount. Every one was typed by hand from a probe script. The fix is structural:
   generate the numbers from the measurement, with a test that fails on drift (workstream **C**).
4. **Check exit codes, not output.** A gate one-liner (`pnpm -s lint | tail -1`) printed a blank line
   for a failing lint. The gate is now scripted to test exit codes.
5. **The release path is part of the product.**
   - `release.yml` publishes without running the test suite, and the Version PR it opens gets no CI
     either: GitHub runs no workflows on PRs created with `GITHUB_TOKEN`.
   - The `alpha` tag sat on the wrong build for three weeks.
   - A Version PR merged while a newer changeset was pending, so `alpha.1` was never published and its
     notes reached no GitHub release.
6. **Check what the tool can do before planning around it.** This plan's first draft said to publish
   with an explicit `--tag alpha`. `changeset publish` rejects `--tag` in pre mode, so that release
   would have failed after versioning: `alpha.1` again. D1 was revised from the changesets source.

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
parallel. F waits on E and on G's test-id rewrites.

### A — Release safety (blocks #104 / `alpha.3`)

| # | Item | Why |
|---|---|---|
| A1 | **Release job** (#106): Node 22; `needs:` the full CI workflow, called as a reusable workflow with read-only permissions (lint, typecheck, test, build, `smoke:mvp`, `smoke:package`); publishes only from `main`. Publishing stays on `changeset publish`, which sends every alpha to `latest` (D1). Docs install `testpilot-qa`, not `@alpha`. | Trusted publishing needs Node ≥ 22.14. The job published untested code, and the Version PR gets no CI of its own. With trusted publishing, CI cannot run `npm dist-tag`, so the docs must point at the tag that moves by itself. |
| A2 | **Never lose a versioned release.** Before the Changesets action runs: if the version in `packages/cli/package.json` is not on npm, **publish it first** (`changeset publish`, push its git tag, create its GitHub release), then let the action version the pending changesets. Refusing to version instead would deadlock: a failed publish plus any new changeset would block every later release. | Stops a repeat of the lost `alpha.1`. The new gate adds a way to strand a version (a red gate on the Version PR's merge commit). Due before `alpha.4`. Until then, RELEASING.md's merge order covers it. |
| A3 | **PR CI** (#106) on Node 20, 22 and 24 (20 stays while `engines` claims it; D6), running `smoke:mvp`, `smoke:package` and a `changeset status` check. Dependabot and the Version PR are exempt. | None of those checks ran on PRs. `@testpilot/ai` changed in four PRs without a changeset. |
| A4 | **Verify the first trusted publish.** The trusted publisher is configured on npmjs.com (owner, 2026-09-28). `alpha.3`'s `_npmUser` must be the GitHub Actions identity, not a person. npm falls back to the token *silently*: alpha.2's run logged "using npm trusted publishing" and was still a token publish. Once confirmed, the owner sets *"require 2FA and disallow tokens"*, deletes `NPM_TOKEN`, and the `NODE_AUTH_TOKEN` line goes. After alpha.3, the owner also removes the retired `alpha` dist-tag. | npm is restricting bypass-2FA tokens for publishing. A tag nobody moves serves an old build silently. |
| A5 | **Repair the `alpha.2` GitHub release notes.** They contain only #84, so Phases 9–11, including the breaking nullable score, appear in no release. | The owner approves the text; editing a published release is outward-facing. |

**Exit:** `alpha.3` published to `latest` through trusted publishing, with provenance, from a job
that ran the full gate; A2 merged before `alpha.4`. Every alpha from here on gets user-facing release
notes (§8).

### B — Correctness bugs on the published surface

Each item is one PR with a reproduction test.

| # | Defect | Source |
|---|---|---|
| B1 | **The Action lets bash glob-expand `patterns`** (#107). An unquoted `${TP_PATTERNS}` turns `tests/**/*.spec.ts` into a subset. The score and baseline gate cover files nobody chose, silently. Ships to Action users only when the `v0` tag is re-pointed, which is a standing step after every `action/` change (RELEASING.md). | surface P1 |
| B2 | **`includeHelpers` never matches a relative glob** (`pages/**`), because it is matched against absolute paths. Setting it also *replaces* the defaults, so `--with-helpers` then analyzes zero helpers. The documented way to opt in does nothing. Also: warn when an entry matches nothing. | surface P1, independently reproduced |
| B3 | **`init` in an existing Playwright project turns a failing gate green.** It hard-codes `testDir: 'tests'` and adds sample tests, so the real suite is no longer analyzed. A score of 0 becomes 100. Needs a detect-and-augment mode, or refuse without `--force`. | surface P1 |
| B4 | **`run` resolves a different Playwright config** than `tags`, `analyze` and `doctor` (root only vs one level down). | surface P1 |
| B5 | **Zero evidence reads as a pass:** `--min-score ""` is parsed as 0; all files failing to parse gives `100 (A)`; a zero-file `--json` report says `100/A`; parse errors never reach SARIF. The fix uses the nullable score that schema 1.11 already publishes, so it is not the breaking score change F reserves. | surface P1/P2 |
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
| C3 | The flag, option and exit-code tables in both READMEs and CLI-Spec are **generated from the Commander program and `exit-codes.ts`**, with a drift test. Install lines name no version (`npm i -D -E testpilot-qa`); a version in a README would go stale on every Version PR, which bumps `package.json` without re-rendering docs. This removes the documented-but-nonexistent `--severity` / `--rules`. |
| C4 | **Released changesets are immutable.** A test fails if a changeset listed in `pre.json` changes after release. (#86 edited one before review caught it; that correction would never have shipped.) |
| C5 | README and npm-page sample output is **generated by running the built CLI** on `examples/fragile-suite` and a fresh `init` project. |
| C6 | Correct every stale published claim the audit listed, after C1–C3 so the numbers are generated rather than retyped. **The npm page (`packages/cli/README.md`) goes first**: it is the most-read artifact and was untouched from `alpha.0` until #106 fixed its install line, `analyze` example and `--output`. |

**Exit:** changing a measured number without regenerating the docs fails CI. "Published docs" means
the two READMEs, `docs/Scoring.md`, `docs/CLI-Spec.md` and the rule pages. Plans, CHANGELOGs and
released changesets are historical records: they keep typed numbers, each with an `as of` date.

### D — A browser oracle for every claim a rule makes

| # | Item |
|---|---|
| D1 | `testIdReplacement` returns a **structured rewrite** carrying tokenizer source offsets (`[{getByTestId: v}, {locator: text}]`), and the message is rendered from it. Today any checker has to re-derive "the rest of the selector" with string surgery, the same hand-reasoning that kept being almost right. |
| D2 | **Oracle job** (Chromium via the existing `playwright-core` dev dependency). It runs on PRs that touch `src/selector` or `src/rules`, **and nightly on `main`**, so a green streak means something. It replays every historical defect shape and every corpus rewrite, and checks **each sentence** a finding prints: *same elements*, *every target has a test-id ancestor*, *the rewrite is a widening*. It builds witness DOMs from the selector so no check passes vacuously, then mutates them. |
| D3 | **Allowlist meta-test:** every entry in `SCOPE_INDEPENDENT_PSEUDOS` / `COMPOUND_ARGUMENT_PSEUDOS` must have a non-vacuous oracle witness. Stateful pseudo-classes (`:hover`, `:focus`, `:checked`) have their state driven, or are dropped until proven. |
| D4 | **Generative fuzzing:** a selector grammar with shrinking and a fixed seed on PRs (about 1,000 selectors, about 40 s) and a random seed nightly (about 20,000). Its first run found six defect families that were not on the historical list *(review)*. |
| D5 | **Structural tokenizer differential** against Playwright's own `parseSelector`: part split, engines, list arity, combinators. Under 1 s, on every PR. The current test only compares accept/reject. |
| D6 | **Equivalent-spelling property tests for every rule.** The reviews found these pairs disagreeing: `li:nth-child(1)` / `li:first-child`; `.btn` / `[class~="btn"]`; `a b c d` / `a >> b >> c >> d`; `text=Save` / `:text("Save")`; `.nth(0)` / `>> nth=0`; `getByTestId('row').locator('td')` / `locator('[data-testid=row] >> td')`. Each rule gets a table of pairs Chromium confirms equivalent, and must give both sides the same answer. |

**Exit:** D2 and D5 run on every PR that touches the analyzer, D2 and D4 run nightly, and every
historical defect shape is in D2's replay set. Estimated about 1–1.5 weeks *(review)*.

### E — Make quality measurable

| # | Item |
|---|---|
| E1 | A **labelled sample** in `bench/labels.json`, keyed by baseline identity, drawn uniformly at random with a fixed seed: **150** each for `no-hard-wait` and `avoid-positional-access`, **300** for `no-css-class-selector`, and **all** findings of any `warn`/`error` rule with fewer than 150, about 600 in total. Each label is `tp` / `hard-fp` / `judgement` with a one-line rationale; `hard-fp` counts against the bound, and `judgement` is reported beside it. A test reports each rule's one-sided 95% Wilson upper bound and fails on label rot. (Sizes are chosen so the gate is reachable: at n = 150, up to 3 `hard-fp` stays under 5%; at n = 300, up to 2 stays under 2%. At n = 60 even zero false positives cannot get under 5%.) |
| E2 | `examples/fragile-suite` becomes a **sixth bench entry**, so `no-nth-child` and `no-deep-css-chain`, which have zero corpus findings, still get a "went silent" gate. |
| E3 | A **ranking** of findings (severity, then confidence), so "the top ten findings" exists for the beta's qualitative gate. |
| E4 | **Runtime budget:** `pnpm bench` records wall time per repo, and CI fails if cal.com (the largest) exceeds 2.5 s on the runner. |

### F — Score 2.0 (replaces the old Phase 12)

The old Phase 12 does not do what its goal says. Its bullets (deduplicate per call site, and exclude
uninspected sites from the denominator) move corpus scores by about one point *(review)*. Its goal
("share of inspected call sites with an actionable problem") is a different formula. Worse, the unit
is wrong today: `.nth()` and `waitForTimeout()` are call sites of their own, so replacing
`page.locator('#save').nth(0)` with `getByRole(…)` **lowers** the score. On a constructed fixture it
goes from 18 to 12 *(review)*.

One breaking release, report schema **2.0**, containing:
- **The unit is a locator chain**, and hard waits are a separate count. A property test asserts that
  fixing a finding never lowers the score.
- **Denominator:** inspected chains only. Add `.first()` / `.last()`, and the
  `page.click('selector')`-style calls no rule reads today: **243** across the corpus (2.9% of 8,501
  call sites), of which 225 are on cal.com (17% of its 1,326) *(review)*. None of them is scored today.
- `null` for zero inspected chains (B5 already covers zero files and zero parsed files).
- Remove the always-100 Accessibility and Maintainability sub-scores. Flakiness becomes a count, not a
  share of locator calls.
- The formula is the **share of clean chains** (D2), `prefer-get-by-test-id` becomes `info` (D3), and
  page objects are analysed by default (D4).
- **Output prints counts first, grade second** ("412 of 1,326 locator chains have a problem"), so the
  grade is read as a summary of something checkable.
- **A migration note:** `--min-score` thresholds must be chosen again, because the scale changes.
  Baselines are unaffected, since they key on findings, not scores.
- Corpus projections re-measured before merge. `docs/Scoring.md` is generated from them (C2).

**Exit:**
- report schema `2.0`;
- the monotonicity property test passes (fixing a finding never lowers the score);
- two suites that differ only in spelling (`locator('[data-testid=x]')` against `getByTestId('x')`)
  score within 5 points;
- a one-line file with one clean locator scores ≥ 50;
- the corpus projections are published through C2.

### G — `fix` that earns its place (replaces the old Phase 13)

- Rewrite what D1 proves exact: about **424** corpus findings *(review)*, or about 441 with helpers.
  That is 414 direct exact matches plus 10 through the engine. The old target ("removes ≥ 500") and
  its "574" predate 11b and are retired. The target is now **every finding the D2 oracle proves**.
- The `prefer-get-by-test-id` rewrites land **before or with F**, because D3 lowers that rule to `info`
  on the understanding that `fix` resolves it.
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
- **Action:** `config`, `with-helpers` and `args` inputs. Its default `version` is already `latest`,
  which matches D1. Also move `action.yml`'s `actions/setup-node@v4` to the v6 the repo's workflows use.
- **`--changed`** (analyse only files changed against a base ref), carried over from the old plan.

### I — Front door (remainder of the old Phase 14)

- Rewrite the npm README from generated sections (C2, C3, C5).
- A "**Why not just `eslint-plugin-playwright`?**" section.
- `docs/Configuration.md`.
- Owner-side: repository topics and Discussions.

### J — Dependencies and platform

| # | Item |
|---|---|
| J1 | Release plumbing **together**: #41 `setup-node` 7, #57 `changesets/action` 2, #100 `@changesets/cli` 3. A `workflow_dispatch` with `PUBLISH_ENABLED=false` never reaches the publish path, which is exactly what these majors could change: the only-pre → `latest` rule D1 relies on, `--tag` handling, git tags, GitHub releases. So verify in a scratch clone against a **local Verdaccio registry**: `changeset version`, then `changeset publish`, and assert the dist-tag, the git tag and the stdout line the action parses. Land it right after a release, so a failure costs nothing. |
| J2 | zod 4 (#101): `.default({})` → `.prefault({})`. A runtime dependency, so it needs a changeset and a green bench. |
| J3 | Biome 2 (#103): `biome migrate`, in an isolated PR. |
| J4 | The `engines` floor, the Action's default `node-version` (still `20`), and `.nvmrc` follow decision **D6**. Move `auto-install-peers` out of `.npmrc`. |
| J5 | pnpm 10, carried over from the old plan. |

## 5. Beta gate

Beta ships when **all** of these hold:
- A, B, C, D and F are complete, each by its own exit criteria.
- For every `warn`/`error` rule, the one-sided 95% Wilson upper bound on `hard-fp` is **below 5%**,
  and **below 2%** for `no-css-class-selector`, as the old plan set it (E1). A rule with too few corpus
  findings for the bound to reach that (fewer than 60: today `no-xpath`, `no-nth-child` and
  `no-deep-css-chain`) needs zero `hard-fp` among all its corpus findings instead, plus an
  equivalent-spelling table confirmed in Chromium (D6).
- The nightly oracle and fuzzer runs (D2, D4) have passed **14 nights in a row**.
- Scores are monotonic: fixing a finding never lowers the score (property test in F).
- Every number in the published docs is generated (C's exit defines the scope).
- A maintainer of a real Playwright suite, running with no flags, agrees with **at least 8 of the top
  10** findings (E3) on their own suite.
- `pnpm bench` stays within the runtime budget (E4).

**Then comes the beta release itself.** RELEASING.md explains why `changeset pre enter beta` while
only alphas exist would freeze `latest` on the last alpha. So the beta release either promotes
`latest` by hand with the owner's 2FA, or goes out as `0.x` stable first. That choice is made when the
gate is met.

## 6. Decisions

Decided 2026-09-28. The owner adopted the recommendations. D1 was revised from the first draft once
the changesets source showed the first recommendation could not be built.

| # | Decision | Decided |
|---|---|---|
| D1 | **Which dist-tag CI publishes to.** Trusted publishing can publish under one tag but cannot run `npm dist-tag`, so only one tag moves per release. | **`latest` is the newest alpha.** `changeset publish` does this by itself while every published version is an alpha, and it rejects `--tag` in pre mode, so "publish to `alpha`" would have needed a custom publish script outside changesets' tagging and release notes. Docs say `npm i -D -E testpilot-qa`, and the Action defaults to `latest`. The `alpha` tag is retired and removed after alpha.3. *(First draft: publish to `alpha`. Withdrawn.)* |
| D2 | **Score formula for 2.0:** a deduplicated weighted penalty (moves about 1 point) or the **share of inspected chains with no `warn`/`error` finding**. | The share. It is what the old goal described, and it reads plainly. With D3 applied, cal.com projects to **about 90**; it would be about 62 with `prefer-get-by-test-id` still at `warn` *(review, call-site approximation; re-measured in F)*. It is a breaking change, so it lands inside the alpha banner. |
| D3 | **`prefer-get-by-test-id` severity.** `locator('[data-testid=x]')` is exactly as fragile as `getByTestId('x')`; as `warn` it opens a 40-point gap *(review)* between identical suites. | `info` in 2.0, with `fix` resolving it. The gate should measure fragility, not spelling. |
| D4 | **Page-object analysis on by default** (overdue since 9c). Scores move by at most 2 points *(review)*. | On by default in 2.0, after B2 fixes `includeHelpers`. |
| D5 | **The labelling budget** (E1, about 600 labels): who labels. | I pre-label, with a rationale for each; the owner audits a random 10% (about 60). |
| D6 | **Node floor** now that Node 20 is end-of-life. | `engines >= 22` at beta, together with the Action's default `node-version`. Until then CI keeps a Node 20 leg, because `engines` still claims it. |
| D7 | **When to remove the `prefer-user-facing-locator` alias.** | At `1.0`, not before. |

## 7. Order of work

1. **A1 and A3** (#106). Then #104 can merge, in the RELEASING.md merge order, and A4 is verified on
   that publish.
2. **A2**, and **B1–B9** as small PRs, all before `alpha.4`.
3. **C and D in parallel.** C first where it overlaps with docs corrections (C6).
4. **E**, then **G's test-id rewrites**, then **F**, then the rest of **G**.
5. **H, I and J** fill in between, with J1 right after a release so any failure costs nothing.

## 8. Carried over from `Post-Alpha-Plan.md`, and dropped

| Old item | Here |
|---|---|
| Phase 12 goal and targets (identical suites within 5 points, one-line file ≥ 50, migration note, counts before grade) | F, in its bullets and exit |
| Phase 13 target "`fix` removes ≥ 500" | G, restated as "every oracle-proved finding" (about 424) |
| Phase 14 front door | I |
| Phase 15 **DOM-aware validation** | **Deferred past beta.** D's browser oracle is its foundation, but checking selectors against the user's own running app is a product of its own. |
| `--changed` mode | H |
| pnpm 10 | J5 |
| Runtime budget ≤ 2.5 s | E4 |
| `no-css-class-selector` < 2% false positives | §5, kept rather than loosened to 5% |
| User-facing release notes for every alpha | A's exit; A5 repairs alpha.2 |
| `role=` → `getByRole` rewrite | **Dropped**: no rule fires on `role=` since 11b |
