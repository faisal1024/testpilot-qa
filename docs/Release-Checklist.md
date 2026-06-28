# TestPilot QA — Release Checklist

> Status: **Public-alpha readiness is the active focus.** All feature milestones through 8A are merged
> (6A baseline/output, 6B SARIF + GitHub Action, 6C `add ai`, 7A HTML report, 7B scoring docs, 8A
> `fix` preview). **Remaining before a public alpha:** the deferred runtime/toolchain dependency majors
> (`commander`, `zod`, `typescript`, `@biomejs/biome` — see triage below) and a clean run of this gate.
> Not yet released. This is the gate to run before tagging an alpha / publishing.

## Pre-release verification

Run from a clean checkout:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm -r build
corepack pnpm smoke:mvp        # requires a prior build
corepack pnpm smoke:package    # requires a prior build + npm registry access
```

Checklist:

- [ ] `pnpm install --frozen-lockfile` succeeds (lockfile committed and current).
- [ ] `pnpm lint` clean (Biome).
- [ ] `pnpm typecheck` clean (`tsc --noEmit`).
- [ ] `pnpm test` green.
- [ ] `pnpm -r build` succeeds for all packages.
- [ ] `pnpm smoke:mvp` green (help/version, `explain --json`, `doctor --json`, `analyze`, `--output`, `--reporter sarif`, `--reporter html`, `--baseline` gate, `fix` dry-run + `--write`, `add ai`, `init` + overwrite protection, example-suite analysis).
- [ ] **GitHub Action sanity:** `action/action.yml` inputs and the README example agree (covered by `action.test.ts`); the action runs the published `testpilot-qa` via `npx`, so don't reference `action@v0` in docs until an alpha tag is published.
- [ ] `pnpm smoke:package` green (see below).
- [ ] **Changeset status:** every user-facing change since the last release has a changeset (`.changeset/*.md`). Run `pnpm changeset status` if needed.
- [ ] **README reviewed:** alpha positioning and the implemented command surface match reality.
- [ ] **`docs/CLI-Spec.md` reviewed:** every command's implemented/deferred status is current.
- [ ] **Generated project smoke checked:** `init` produces the expected files, the parallel/sample test scripts, the AI guidance files, and the plain-Playwright README note (covered by `smoke:mvp`/`smoke:package`, scaffold tests, and — when browsers are available — `npx playwright test`).
- [ ] CI `verify` is green on the release commit.

## `smoke:mvp` vs `smoke:package`

| | `smoke:mvp` | `smoke:package` |
|---|---|---|
| **Runs the CLI from** | the in-repo build (`packages/cli/dist`) | a **packed tarball installed into a fresh project** |
| **What it proves** | the built CLI behaves correctly end to end | the **published artifact is self-contained and installable** — bundled `@testpilot/*` code + real npm deps resolve from the tarball alone |
| **Network** | none | npm registry (for the tarball's real deps) once, then offline |
| **When to run** | every change (fast) | before tagging/publishing an alpha |

`smoke:package` is the one that catches "works in the monorepo but breaks on `npm install`" problems
(e.g. a workspace dep that isn't bundled or declared). Browsers are never downloaded and no Playwright
tests run in either.

## MVP scope confirmation (don't ship beyond this)

Implemented surface: `init`, `run`, `analyze` (six Tier 1 rules + Locator Quality Score + `--min-score` + `--baseline` no-regression gate + `--reporter table|json|sarif|html` + `--output`), `fix` (safe mechanical rewrites, dry-run by default), `doctor`, `explain`, `add ai` (safe guidance regeneration), and a composite GitHub Action wrapping the CLI. Deliberately **out** of scope for the alpha: DOM-aware suggestions/rewrites, broader auto-fix, AI/LLM, MCP, dashboards, public plugin API, `--changed`, and any Playwright-replacement behavior.

## Dependency PR triage (before public alpha)

Open, failing dependency PRs make an early public repo look unmaintained. Strategy:

- **Safe to merge separately, once green:** GitHub Action major bumps and `@types/node`. Each just
  needs CI `verify` (and a local `typecheck` for `@types/node`) to pass.
- **Runtime/toolchain majors get their own PR + full local gate** (`lint`/`typecheck`/`test`/`build`
  + `smoke:mvp` + `smoke:package`): `commander`, `zod` (runtime), `typescript`, `@biomejs/biome`
  (toolchain). Never batch these.
- **Do not merge a failing dependency PR** before the public alpha. A red PR is worse than an
  outdated dependency.
- Dependency PRs are **not** merged on feature/milestone branches.

### Status (Milestone 5D)

| PR | Bump | Risk | Status |
|---|---|---|---|
| pnpm/action-setup 4→6 | GitHub Action (major) | Low | **Done (5D)** — bumped in-repo; Dependabot's red PR (#1) was stale-base only. |
| actions/setup-node 4→6 | GitHub Action (major) | Low | **Done (5D)** — bumped in-repo; #2's red CI was stale base. |
| actions/checkout 4→7 | GitHub Action (major) | Low | **Done (5D)** — bumped in-repo (#17). |
| @types/node 22→25 | dev type (major) | Medium | **Done (5D)** — typecheck + build clean. |
| commander 12→15 | **runtime** (major) | Medium–High | **Deferred** — own PR. CI green on Dependabot #4, but per policy a runtime major gets its own PR + manual parse checks (globals before/after command, `run -- <args>`, `--quiet`, `--json`) + `smoke:package`. |
| typescript 5.9→6.0 | toolchain (major) | Medium–High | **Deferred** — own PR; Dependabot #6 fails CI (real). Re-run `typecheck`/`build` (tsup/dts). |
| @biomejs/biome 1.9→2.5 | toolchain (major) | High | **Deferred** — own PR; #7 fails (Biome 2.x config schema change → `biome migrate` `biome.json`). |
| zod 3.25→4.x | **runtime** (major) | High | **Deferred** — own PR; #10 fails (zod v4 API/behavior). Config schema relies on `.strict()`/`.default()`/`.record()`/optional. |

The deferred runtime/toolchain majors are intentionally **not** blocking the public alpha — each will get its own PR + full gate when tackled. Because the CLI **bundles** `@testpilot/*` and declares its real deps (`commander`, `zod`, `jiti`, `tinyglobby`, `@typescript-eslint/parser`), runtime-dep bumps must be validated with `smoke:package`, not just `smoke:mvp`.
