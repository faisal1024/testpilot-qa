# Releasing TestPilot QA

The only published package is **`testpilot-qa`** (`packages/cli`). The internal `@testpilot/*` packages
are `private` and bundled into it. Releases run through **Changesets**; the published CLI version is read
from `package.json` (never hand-edit a version constant).

## Public alpha — dist-tag `alpha` (not `latest`)

The alpha ships under the npm **`alpha`** dist-tag. This uses Changesets **pre-release mode**
(`changeset pre enter alpha`), which produces `x.y.z-alpha.N` versions.

> ⚠️ **`changeset publish` does not reliably keep the `alpha` tag.** In pre mode it only uses the
> pre-tag while the package has no normal release; for a package whose *only* published versions are
> prereleases it falls back to publishing at **`latest`** (the action logs this: "…except for packages
> that have not had normal releases which will be published to `latest`"). So the first alpha may land
> on `alpha` but a later `alpha.N` can land on `latest`.
>
> **Therefore: verifying and fixing the dist-tag after every alpha publish is mandatory** — see
> [Post-publish](#post-publish). Passing an explicit `--tag` is rejected by `changeset publish` in pre
> mode, so the fix-up is `npm dist-tag`.

## One-time setup (maintainer)

Publishing stays **disabled** until you opt in: the release workflow only publishes when the repository
variable **`PUBLISH_ENABLED`** is `true`. Until then it still maintains the "Version Packages" PR
whenever unconsumed changesets are present (with none pending it simply does nothing), so `main` stays
green.

### 1. Choose how CI authenticates to npm

**Option A — trusted publishing (recommended, no long-lived secret).** npm mints a short-lived
credential from the workflow's OIDC identity, and provenance is attached automatically.

> ⚠️ **First publish caveat:** a trusted publisher is configured on the **package's** settings page on
> npmjs.com, which requires the package to already exist. `testpilot-qa` has never been published, so
> the *very first* release needs a one-time authenticated publish — either Option B, or the local
> fallback in [Manual publish](#manual-publish-fallback-if-not-using-ci) (it must run from
> `packages/cli` after a build; the repo root is `private`). After that first version exists, switch to
> trusted publishing and delete the token.
>
> A local first publish creates no git tag, no GitHub release, and **no provenance**, and the next CI
> run will report "No unpublished projects to publish" — so the OIDC path is first genuinely exercised
> on `alpha.1`.

1. On npmjs.com → the `testpilot-qa` package → **Settings → Trusted Publisher → GitHub Actions**.
2. Repository: `faisal1024/testpilot-qa`; workflow filename: `release.yml` (leave environment blank
   unless the job uses one).
3. Leave `NPM_TOKEN` **unset**. The workflow already grants `id-token: write` and upgrades npm to
   >= 11.5.1 (Node 20 bundles npm 10, which cannot do OIDC publishing).

**Option B — automation token.** Create an npm **automation** token with publish rights and add it as
the GitHub Actions secret **`NPM_TOKEN`** (read by the workflow as `NODE_AUTH_TOKEN`).

### 2. Turn publishing on

Add the repository **variable** `PUBLISH_ENABLED = true`
(Settings → Secrets and variables → Actions → *Variables*).

### 3. Allow the Version PR

Settings → Actions → General → enable *"Allow GitHub Actions to create and approve pull requests"*
(Changesets opens the Version PR).

## Release flow (CI, via `.github/workflows/release.yml`)

1. Land feature PRs with changesets on `main` (already done for 6A–8A).
2. Land the alpha pre-mode + version bump (see "Cutting the alpha" below).
3. With npm auth configured (Option A or B) **and** `PUBLISH_ENABLED=true`, the Changesets action
   publishes `testpilot-qa@<version>` once there are no pending changesets — on the next push to
   `main`, or immediately via **Run workflow** (`workflow_dispatch`). Then fix up the dist-tag
   (see [Post-publish](#post-publish)).

## Cutting the alpha (the version PR)

From a clean `main` with the release-prep merged:

```bash
corepack pnpm changeset pre enter alpha   # writes .changeset/pre.json
corepack pnpm changeset version           # → 0.1.0-alpha.0, consumes changesets, writes CHANGELOGs
corepack pnpm install                     # sync the lockfile to the new versions
```

Open that as the **Version PR**. Merging it triggers the publish only when npm auth is configured
**and** `PUBLISH_ENABLED=true`; otherwise flip the variable and run the workflow manually.

> To later cut a **stable** release, `corepack pnpm changeset pre exit`, then `changeset version` /
> publish normally (dist-tag `latest`).

## Pre-publish gate (must pass)

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm -r build
corepack pnpm smoke:mvp
corepack pnpm smoke:package
corepack pnpm changeset status
```

See [`docs/Release-Checklist.md`](docs/Release-Checklist.md) for the full launch gate.

## Manual publish (fallback, if not using CI)

```bash
corepack pnpm -r build
cd packages/cli && npm publish --tag alpha   # NEVER publish the alpha to `latest`
```

## Post-publish

**1. Verify and fix the dist-tag (mandatory — see the warning above).**

```bash
npm dist-tag ls testpilot-qa
# If the new version landed on `latest`, move it to `alpha` and remove `latest`:
npm dist-tag add testpilot-qa@<version> alpha
npm dist-tag rm  testpilot-qa latest      # keep `latest` empty during the alpha
```

**2. If this was the first trusted-publishing run,** confirm npm's OIDC exchange actually happened in
the job log (rather than assuming); if it was skipped, drop `registry-url` from the workflow or set
`NODE_AUTH_TOKEN` only when the secret exists.

- Verify: `npx testpilot-qa@alpha --version` / `--help` / `init demo --yes` / `analyze tests --reporter html`.
- Switch the root README quickstart to `npx testpilot-qa@alpha …`.
- Optionally create the `v0` Git tag / GitHub release so the GitHub Action example's `@v0` resolves
  (until then the README points users to a SHA or `@main`).
