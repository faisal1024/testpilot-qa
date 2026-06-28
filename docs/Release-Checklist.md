# TestPilot QA — Release Checklist

> Status: MVP release-candidate readiness (Milestone 4C).
> This is the gate to run before tagging an MVP release.

## Pre-release verification

Run from a clean checkout:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm -r build
corepack pnpm smoke:mvp        # requires a prior build
```

Checklist:

- [ ] `pnpm install --frozen-lockfile` succeeds (lockfile committed and current).
- [ ] `pnpm lint` clean (Biome).
- [ ] `pnpm typecheck` clean (`tsc --noEmit`).
- [ ] `pnpm test` green.
- [ ] `pnpm -r build` succeeds for all packages.
- [ ] `pnpm smoke:mvp` green (help/version, `explain --json`, `doctor --json`, `analyze`, `init` + overwrite protection).
- [ ] **Changeset status:** every user-facing change since the last release has a changeset (`.changeset/*.md`). Run `pnpm changeset status` if needed.
- [ ] **README reviewed:** the implemented command surface and examples match reality.
- [ ] **`docs/CLI-Spec.md` reviewed:** every command's implemented/deferred status is current.
- [ ] **Generated project smoke checked:** `init` produces the expected files, the parallel/sample test scripts, and the plain-Playwright README note (covered by `smoke:mvp`, scaffold tests, and — when browsers are available — `npx playwright test`).
- [ ] CI `verify` is green on the release commit.

## MVP scope confirmation (don't ship beyond this)

Implemented MVP surface: `init`, `run`, `analyze` (six Tier 1 rules + Locator Quality Score + `--min-score`), `doctor`, `explain`. Deliberately **out** of the MVP: auto-fix, DOM-aware suggestions, AI/LLM, HTML/SARIF reports, MCP, dashboards, public plugin API, baseline/`--changed`, and any Playwright-replacement behavior.

## Dependency PR triage

Dependabot PRs are **not** merged on feature branches. Triage before/after an MVP release:

| PR | Bump | Risk | Handling |
|---|---|---|---|
| pnpm/action-setup 4→6 | GitHub Action (major) | Low | Safe once CI `verify` passes on the PR. |
| actions/setup-node 4→6 | GitHub Action (major) | Low | Safe once CI passes. |
| actions/checkout 4→7 | GitHub Action (major) | Low | Safe once CI passes. |
| @types/node 22→25 | dev type (major) | Medium | Likely safe; may surface new type errors — run `typecheck` on the PR. |
| commander 12→15 | **runtime** (major) | Medium–High | Careful: CLI arg parsing. Verify every command, global options, and the command-level tests + `smoke:mvp` before merging. |
| typescript 5.9→6.0 | dev (major) | Medium–High | Careful: re-run `typecheck` and `build` (tsup/dts). Hold until green. |
| @biomejs/biome 1.9→2.5 | dev (major) | High | Careful: Biome 2.x changed the config schema — `biome.json` (1.x format) must be migrated (`biome migrate`) or lint/format will break. Do as its own PR. |
| zod 3.25→4.x | **runtime** (major) | High | Careful: zod v4 has API/behavior changes. Our config schema relies on `.strict()`, `.default()`, `.record()`, optional fields — re-run config + analyze tests. Do as its own PR. |

**Rule of thumb:** GitHub Action majors and `@types/node` are low-risk batch merges once CI is green. The **runtime** deps (`commander`, `zod`) and the **toolchain** majors (`typescript`, `biome`) each get their own PR, full local gate, and `smoke:mvp` before merging — never batched.
