# TestPilot QA — Release Checklist

> Status: **Public-alpha readiness is the active focus.** All feature milestones through 8A are merged
> (6A baseline/output, 6B SARIF + GitHub Action, 6C `add ai`, 7A HTML report, 7B scoring docs, 8A
> `fix` preview).
> **✅ Published: `testpilot-qa@0.1.0-alpha.0` is live on npm** under the **`alpha`** dist-tag, with SLSA
> provenance, released by CI via the Changesets workflow (2026-09-05).
> The deferred runtime/toolchain dependency majors (`commander`, `zod`, `typescript`, `@biomejs/biome`)
> remain **post-alpha hardening** — each handled in its own PR with full validation.
>
> Note: npm sets `latest` on a package's first publish, so `latest` also points at `0.1.0-alpha.0`. The
> `alpha` tag is authoritative for this phase; keep using the dist-tag check below on every release.

## Public alpha launch gate

The alpha is ready to publish when **all** of these pass on the release commit with the **current pinned
dependencies** — no deferred dependency major is required first.

1. `corepack pnpm install --frozen-lockfile` — clean install (lockfile committed and current)
2. `corepack pnpm lint`
3. `corepack pnpm typecheck`
4. `corepack pnpm test`
5. `corepack pnpm -r build`
6. `corepack pnpm smoke:mvp`
7. `corepack pnpm smoke:package`
8. `corepack pnpm changeset status` — every user-facing change has a changeset
9. **npm alpha publish** — publish under the `alpha` dist-tag, then **verify the dist-tag actually
   landed** (`npm dist-tag ls testpilot-qa`) and fix it up with `npm dist-tag add/rm` if the release
   went to `latest` — Changesets pre-mode does not reliably keep the pre-tag. Then confirm a fresh
   `npx testpilot-qa@alpha --version` works
10. **README sanity check** — alpha positioning honest; the Try-it path actually works end to end

npm auth for step 9 (trusted publishing or a token) plus the `PUBLISH_ENABLED` switch are described in
[`RELEASING.md`](../RELEASING.md).

The detailed checklist below expands steps 1–8; **post-alpha hardening** (the deferred dependency majors)
is tracked in [Dependency PR triage](#dependency-pr-triage-post-alpha-hardening).

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
- [ ] **GitHub Action sanity:** `action/action.yml` inputs and the README example agree (covered by `action.test.ts`); the action runs the published `testpilot-qa` via `npx` (now live on the `alpha` tag), and the `v0` tag exists — re-point `v0` whenever `action/action.yml` changes.
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

## Dependency PR triage (post-alpha hardening)

The alpha launches on the current pinned dependencies. The remaining dependency majors are **post-alpha
hardening**, not launch blockers — but each still gets its own PR + full validation before it merges, so
the repo stays green. Strategy:

- **Safe to merge separately, once green:** GitHub Action major bumps and `@types/node`. Each just
  needs CI `verify` (and a local `typecheck` for `@types/node`) to pass. (All done — see table.)
- **Runtime/toolchain majors get their own PR + full local gate** (`lint`/`typecheck`/`test`/`build`
  + `smoke:mvp` + `smoke:package`): `commander`, `zod` (runtime), `typescript`, `@biomejs/biome`
  (toolchain). Never batch these.
- **Never merge a failing dependency PR.** A red PR is worse than an outdated dependency — which is
  exactly why these are deferred rather than rushed in before launch.
- Dependency PRs are **not** merged on feature/milestone branches.

### Status (Milestone 5D)

| PR | Bump | Risk | Status |
|---|---|---|---|
| pnpm/action-setup 4→6 | GitHub Action (major) | Low | **Done (5D)** — bumped in-repo; Dependabot's red PR (#1) was stale-base only. |
| actions/setup-node 4→6 | GitHub Action (major) | Low | **Done (5D)** — bumped in-repo; #2's red CI was stale base. |
| actions/checkout 4→7 | GitHub Action (major) | Low | **Done (5D)** — bumped in-repo (#17). |
| @types/node 22→25 | dev type (major) | Medium | **Done (5D)** — typecheck + build clean. |
| commander 12→15 | **runtime** (major) | Medium–High | **Deferred (post-alpha)** — own PR. CI green on Dependabot #4, but per policy a runtime major gets its own PR + manual parse checks (globals before/after command, `run -- <args>`, `--quiet`, `--json`) + `smoke:package`. |
| typescript 5.9→6.0 | toolchain (major) | Medium–High | **Deferred (post-alpha)** — own PR; Dependabot #6 fails CI (real). Re-run `typecheck`/`build` (tsup/dts). |
| @biomejs/biome 1.9→2.5 | toolchain (major) | High | **Deferred (post-alpha)** — own PR; #7 fails (Biome 2.x config schema change → `biome migrate` `biome.json`). |
| zod 3.25→4.x | **runtime** (major) | High | **Deferred (post-alpha)** — own PR; #10 fails (zod v4 API/behavior). Config schema relies on `.strict()`/`.default()`/`.record()`/optional. |

The deferred runtime/toolchain majors are intentionally **not** blocking the public alpha — each will get its own PR + full gate when tackled. Because the CLI **bundles** `@testpilot/*` and declares its real deps (`commander`, `zod`, `jiti`, `tinyglobby`, `@typescript-eslint/parser`), runtime-dep bumps must be validated with `smoke:package`, not just `smoke:mvp`.
