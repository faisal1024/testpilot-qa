# Releasing TestPilot QA

The only published package is **`testpilot-qa`** (`packages/cli`). The internal `@testpilot/*` packages
are `private` and bundled into it. Releases run through **Changesets**; the published CLI version is read
from `package.json` (never hand-edit a version constant).

## Prereleases publish to `latest`

Alphas are cut in Changesets **pre-release mode** (`changeset pre enter alpha`), which produces
`x.y.z-alpha.N` versions. Until the package has had a **stable** release, `changeset publish` publishes
every prerelease to **`latest`**, not to the pre-mode tag. This is Changesets' documented behaviour
(the release log says "…is being published to `latest` rather than `alpha` because there has not been a
regular release of it yet"), and `changeset publish --tag` is rejected outright in pre mode.

**So `latest` is the newest prerelease, and that is the install path we document**:
`npm i -D -E testpilot-qa`. Nothing needs fixing after a publish.

The **`alpha`** dist-tag is legacy. The first alphas were documented as `@alpha`, and CI can't move it:
trusted publishing authorises `npm publish`, not `npm dist-tag`. It stays where it was last moved by
hand, and nothing in the docs points at it any more. Move it by hand if you want it current
(`npm dist-tag add testpilot-qa@<version> alpha`, which needs your 2FA); otherwise leave it or remove it.

At the first stable release (`changeset pre exit`), `latest` becomes the stable line, and later
prereleases go to their pre-mode tag automatically.

## One-time setup (maintainer)

Publishing stays **disabled** until you opt in: the release workflow only publishes when the repository
variable **`PUBLISH_ENABLED`** is `true`. Until then it still maintains the "Version Packages" PR
whenever unconsumed changesets are present (with none pending it simply does nothing), so `main` stays
green.

### 1. Choose how CI authenticates to npm

**Option A — trusted publishing (recommended, no long-lived secret).** npm mints a short-lived
credential from the workflow's OIDC identity, and provenance is attached automatically.

> ✅ **First publish: done.** `testpilot-qa@0.1.0-alpha.0` was published from CI on 2026-09-05 using a
> granular token with *Bypass two-factor authentication* enabled — with SLSA provenance, and Changesets
> created the git tag and the GitHub pre-release. The package now exists, so a **trusted publisher can
> be configured** (steps below) and the token can be deleted.

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
cd packages/cli && npm publish --tag alpha   # then re-point `latest` per the policy above
```

## Post-publish

**1. Confirm it is `latest`:** `npm view testpilot-qa version` should print the new version.

**2. Confirm how it was authenticated.** `npm view testpilot-qa@<version> _npmUser` shows a *person*
for a token publish and the GitHub Actions identity for a trusted publish. Once a trusted publish is
confirmed, remove `NODE_AUTH_TOKEN` from `release.yml`, delete the `NPM_TOKEN` secret, and set the
package's *Publishing access* to "require two-factor authentication and disallow tokens".

- Verify: `npx testpilot-qa@alpha --version` / `--help` / `init demo --yes` / `analyze tests --reporter html`.
- ✅ Done for 0.1.0-alpha.0: README pins `@alpha` in the first-contact examples and documents `npm i -D testpilot-qa@alpha`.
- ✅ The `v0` Action tag exists. **Standing obligation:** re-point `v0` whenever `action/action.yml`
  changes (`git tag -f v0 <sha> && git push -f origin v0`).
