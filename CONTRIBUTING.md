# Contributing to TestPilot QA

Thanks for your interest in contributing! This document covers local setup and the conventions we follow.

## Prerequisites

- **Node.js** ≥ 20 (see `.nvmrc`)
- **pnpm** 9 (`corepack enable` provides it)

## Setup

```bash
git clone https://github.com/faisal1024/testpilot-qa.git
cd testpilot-qa
pnpm install
```

## The verification gate

Every change must pass the full gate locally and in CI:

```bash
pnpm build       # bundle every package (tsup)
pnpm typecheck   # tsc --noEmit across the workspace
pnpm lint        # biome check (lint + format + import order)
pnpm test        # vitest
```

Auto-fix formatting and import order with:

```bash
pnpm format      # biome format --write
pnpm exec biome check --write .
```

## Rule docs are generated

`docs/rules/*.md` (one page per rule plus the index) is generated from
`packages/locator-intelligence/src/explanations.ts` — the same source `testpilot explain` prints. Do
not edit those pages by hand: change the explanation (or a rule's `docsUrl`), run `pnpm docs:rules`
(it rebuilds the engine first), and commit the regenerated pages. `rule-docs.test.ts` fails when the
committed pages drift from the generator.

## The corpus benchmark

`pnpm bench` runs the built CLI against pinned commits of five real open-source Playwright suites and
diffs the result against `bench/baseline.json`. It exists because unit tests cannot see the failure
that matters most here: a rule or discovery change that quietly narrows what gets analyzed on a real
repo.

**What gates, and why.** `findings` is by construction the sum of the per-rule counts, so any drop in
findings always moves a rule row — "a rule row moved" tells you nothing about whether the change was
intended. The gate therefore watches the **evidence that the analysis happened**, which is orthogonal
to rule precision:

| gate | meaning |
|---|---|
| `filesAnalyzed` decreased | we opened fewer files |
| `callSites` decreased | we opened the files and stopped seeing the locators |
| `parseErrors` increased | we opened the files and could not read them |
| `discovery.*` fell back to `default` | we stopped reading the project's config |
| a warning appeared, or appeared more often | the tool is saying it could not see something |
| a repo vanished from the run | the corpus itself narrowed |

One more gate sits above the table: a rule that fired in every repo and now fires **nowhere**, with no
new rule id to account for it. That is not calibration.

Findings and per-rule counts are otherwise **reporting, not gating** — removing false positives moves
them and leaves the gate untouched, which is what a rule-level precision change should look like.
**Work on the extractor is different**: narrowing what counts as a locator call site (ignoring a
non-Playwright `.locator()`, or dropping hard waits from the denominator) legitimately reduces
`callSites` and *will* trip the gate. That is deliberate — it is a real change in what the tool sees —
so explain it in the PR and record the baseline with a reason that says so.

Known gap: `filesAnalyzed` is a count, not a set, so a change that drops five spec files and picks up
five helper files is invisible. Watch the per-rule rows when discovery changes.

- First run clones into `.bench-cache/` (gitignored) and needs the network; later runs reuse it. The
  cache is keyed on the pin *and* the sparse patterns, so editing either re-checks-out.
- Requires a prior `pnpm -r build`. Needs git ≥ 2.25 (`sparse-checkout`).
- Accept an intended change with `pnpm bench --update-baseline --reason "..."`. The diff is printed
  **before** the write, so the reason is written after the evidence; a baseline that would record a
  loss of signal additionally needs `--accept-signal-loss`. The reason is stored in the file, so an
  unexplained bump is visibly empty. `--update-baseline` always runs the whole corpus — a partial
  baseline silently drops repos.
- It runs in CI on pull requests that touch `packages/`, `bench/`, or the bench scripts, so the change
  that would introduce a regression is the one that sees it. The corpus is cached on
  `bench/corpus.json`, so a warm run is seconds.
- A baseline may not carry warnings, a zero-file repo, or discovery anchored outside the checkout.
  Those are harness bugs, and recording them normalizes the exact false green this catches.
- `bench/corpus.json` pins each repo's commit; the runner refuses to diff when a pin moves, because
  the resulting churn would be indistinguishable from a tool regression. Every sparse pattern must
  match something, and every directory the repo's Playwright config declares as a test root must be
  checked out.

## Conventions

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, …).
- **Branches:** branch off `main`; open a PR. Do not commit directly to `main`.
- **Changesets:** user-facing changes require a changeset — run `pnpm changeset` and commit the generated file.
- **Scope:** keep PRs focused. Foundation/architecture decisions are tracked as ADRs and in `docs/`.

## Project layout

This is a pnpm monorepo. Package boundaries and responsibilities are documented in
[`docs/Architecture.md`](docs/Architecture.md). The MVP scope and roadmap live in
[`docs/Roadmap.md`](docs/Roadmap.md).

## Code of Conduct

Participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md).
