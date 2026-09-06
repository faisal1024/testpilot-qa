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
