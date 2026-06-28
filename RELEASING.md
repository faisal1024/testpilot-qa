# Releasing TestPilot QA

The only published package is **`testpilot-qa`** (`packages/cli`). The internal `@testpilot/*` packages
are `private` and bundled into it. Releases run through **Changesets**; the published CLI version is read
from `package.json` (never hand-edit a version constant).

## Public alpha — dist-tag `alpha` (not `latest`)

The alpha is published under the npm **`alpha`** dist-tag so `latest` stays empty until a stable release.
This requires Changesets **pre-release mode** (`changeset pre enter alpha`): in pre mode the versions are
`x.y.z-alpha.N` and `changeset publish` tags them `alpha`. (Plain `changeset publish` would target
`latest`.)

## One-time setup (maintainer)

1. **npm auth:** create an npm **automation** token with publish rights to `testpilot-qa` and add it as
   the GitHub Actions secret **`NPM_TOKEN`**. (The release workflow reads `secrets.NPM_TOKEN`.)
2. **Allow the release PR:** in repo **Settings → Actions → General**, enable
   *"Allow GitHub Actions to create and approve pull requests"* (Changesets opens the Version PR).

## Release flow (CI, via `.github/workflows/release.yml`)

1. Land feature PRs with changesets on `main` (already done for 6A–8A).
2. Land the alpha pre-mode + version bump (see "Cutting the alpha" below).
3. With `NPM_TOKEN` set, the Changesets action publishes `testpilot-qa@<version>` to the `alpha` tag on
   push to `main` once there are no pending changesets.

## Cutting the alpha (the version PR)

From a clean `main` with the release-prep merged:

```bash
corepack pnpm changeset pre enter alpha   # writes .changeset/pre.json
corepack pnpm changeset version           # → 0.1.0-alpha.0, consumes changesets, writes CHANGELOGs
corepack pnpm install                     # sync the lockfile to the new versions
```

Open that as the **Version PR**. Merging it (with `NPM_TOKEN` set) triggers the publish.

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

- Verify: `npx testpilot-qa@alpha --version` / `--help` / `init demo --yes` / `analyze tests --reporter html`.
- Switch the root README quickstart to `npx testpilot-qa@alpha …`.
- Optionally create the `v0` Git tag / GitHub release so the GitHub Action example's `@v0` resolves
  (until then the README points users to a SHA or `@main`).
