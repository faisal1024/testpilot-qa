# TestPilot QA — Release Checklist

> Status: Public-alpha readiness (Milestone 5C).
> This is the gate to run before tagging an alpha / publishing.

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
- [ ] `pnpm smoke:mvp` green (help/version, `explain --json`, `doctor --json`, `analyze`, `init` + overwrite protection, example-suite analysis).
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

Implemented MVP surface: `init`, `run`, `analyze` (six Tier 1 rules + Locator Quality Score + `--min-score`), `doctor`, `explain`. Deliberately **out** of the MVP: auto-fix, DOM-aware suggestions, AI/LLM, HTML/SARIF reports, MCP, dashboards, public plugin API, baseline/`--changed`, and any Playwright-replacement behavior.

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

| PR | Bump | Risk | Handling |
|---|---|---|---|
| pnpm/action-setup 4→6 | GitHub Action (major) | Low | Merge once CI `verify` passes. |
| actions/setup-node 4→6 | GitHub Action (major) | Low | Merge once CI passes. |
| actions/checkout 4→7 | GitHub Action (major) | Low | Merge once CI passes. |
| @types/node 22→25 | dev type (major) | Medium | Likely safe; run `typecheck` on the PR first. |
| commander 12→15 | **runtime** (major) | Medium–High | Own PR: CLI arg parsing — run every command, the command-level tests, `smoke:mvp` + `smoke:package`. |
| typescript 5.9→6.0 | toolchain (major) | Medium–High | Own PR: re-run `typecheck` and `build` (tsup/dts). |
| @biomejs/biome 1.9→2.5 | toolchain (major) | High | Own PR: Biome 2.x changed the config schema — migrate `biome.json` (`biome migrate`) or lint/format breaks. |
| zod 3.25→4.x | **runtime** (major) | High | Own PR: zod v4 API/behavior changes — our config schema relies on `.strict()`/`.default()`/`.record()`/optional; re-run config + analyze tests. |

> Because the CLI now **bundles** `@testpilot/*` and declares its real deps (`commander`, `zod`,
> `jiti`, `tinyglobby`, `@typescript-eslint/parser`), runtime-dep bumps must be validated with
> `smoke:package`, not just `smoke:mvp`.
