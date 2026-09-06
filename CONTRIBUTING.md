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
repo. A drop in `filesAnalyzed`, or findings vanishing with no rule change, **fails the run**.

- First run clones into `.bench-cache/` (gitignored) and needs the network; later runs reuse it.
- Requires a prior `pnpm -r build`.
- Accept an intended change with `pnpm bench --update-baseline`, and say in the PR why the numbers
  moved. A baseline bump with no explanation is how signal loss gets normalized.
- `bench/corpus.json` pins each repo's commit, so a diff measures TestPilot, not upstream churn.

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
