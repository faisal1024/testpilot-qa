# Releasing TestPilot QA

The only published package is **`testpilot-qa`** (`packages/cli`). The internal `@testpilot/*` packages
are `private` and bundled into it. Releases run through **Changesets**; the published CLI version is read
from `package.json` (never hand-edit a version constant).

## Prereleases publish to `latest`

Alphas are cut in Changesets **pre-release mode** (`changeset pre enter alpha`), which produces
`x.y.z-alpha.N` versions. `changeset publish` sends a prerelease to **`latest`**, not to the pre-mode
tag, **while every version already on npm is a prerelease with the current pre tag** (Changesets calls
this "only-pre"; the release log says "…is being published to `latest` rather than `alpha` because
there has not been a regular release of it yet"). `changeset publish --tag` is rejected outright in
pre mode.

**So during the alpha series `latest` is the newest alpha, and that is the install path we
document**: `npm i -D -E testpilot-qa`. Nothing needs fixing after a publish.

> ⚠️ **Changing pre tag breaks this.** The check is "every published version carries the *current*
> pre tag". `changeset pre enter beta` while only alphas exist fails it, so betas go to `beta` and
> `latest` silently freezes on the last alpha — the path the README and the Action's default use.
> Before the first beta, either cut a stable release first, or plan the `latest` promotion
> (a manual `npm dist-tag add`, which needs your 2FA) as part of that release, and update the docs.

**The `alpha` dist-tag is retired.** The first alphas were documented as `@alpha`; CI can't move it,
because trusted publishing authorises `npm publish`, not `npm dist-tag`. A tag left behind serves a
stale build *silently*, which is the worst way for it to fail, so once alpha.3 is on `latest`, remove
it: `npm dist-tag rm testpilot-qa alpha` (your 2FA). `@alpha` and the Action's `version: alpha` then
fail loudly with "No matching version", and the alpha.3 release notes say what to use instead.

At the first stable release (`changeset pre exit`), `latest` becomes the stable line, and later
prereleases go to their pre-mode tag automatically.

## Merge order around a Version PR

The release workflow keeps **one** pending run (`concurrency`, no cancel). If a PR carrying a changeset
lands while the Version PR is stale, merging the Version PR produces a commit that *still* has
pending changesets, so the release run versions again instead of publishing. The version you just
merged is then never published. That is how `0.1.0-alpha.1` was lost.

1. Merge feature PRs, then **wait for the Release run on that commit to finish**. It regenerates the
   Version PR.
2. Confirm the Version PR's head moved and its CHANGELOG diff includes the last change you merged.
3. Merge **nothing else carrying a changeset, including an empty one** (`pnpm changeset --empty`),
   then merge the Version PR. Dependabot PRs carry no changeset, so they're harmless here. An empty
   changeset is not harmless: while one is pending, `changesets/action` logs "All changesets are
   empty; not creating PR" and stops. It neither publishes nor versions, and the run stays green.
4. Wait for the publish run to finish before merging anything else.

**If the gate fails on the Version PR's merge commit:**
- A flake: **Re-run failed jobs**. That publishes the version.
- A real failure: merge the code fix **with no changeset**. `main` isn't protected, so the failing
  "Changeset present" check doesn't block the merge. The next Release run then publishes the version
  you already merged. A fix that carries a changeset, even an empty one, makes that run version
  again or stop instead, and the merged version is never published. Road-to-Beta A2 removes this
  hazard.

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
3. The workflow grants `id-token: write`, runs on Node 22 and upgrades npm to >= 11.5.1 (Node 22
   bundles npm 10, which cannot do OIDC publishing). **In use since `0.1.0-alpha.3`**, the first
   version whose `_npmUser` is GitHub Actions. The workflow passes no token, on purpose: npm falls
   back to a token *silently*, so a broken trusted-publisher config would otherwise go unnoticed.
   With no real token in the job, a broken config fails the publish loudly instead. Setting the
   package to *disallow tokens* (an owner step, Road-to-Beta A4) keeps it that way if a token is
   ever re-added.

**Option B — granular access token (not used).** Only if trusted publishing is unavailable: a
granular npm token with publish rights, stored as the secret `NPM_TOKEN` and passed to the Changesets
step as `NODE_AUTH_TOKEN`. This requires re-allowing tokens on the package. npm has removed classic
automation tokens, and granular tokens expire.

### 2. Turn publishing on

Add the repository **variable** `PUBLISH_ENABLED = true`
(Settings → Secrets and variables → Actions → *Variables*).

### 3. Allow the Version PR

Settings → Actions → General → enable *"Allow GitHub Actions to create and approve pull requests"*
(Changesets opens the Version PR).

## Release flow (CI, via `.github/workflows/release.yml`)

1. Land feature PRs with changesets on `main`. Each push runs the full CI gate (`ci.yml`, called
   from `release.yml`) and then refreshes the Version PR.
2. Merge the Version PR in the order under [Merge order](#merge-order-around-a-version-pr). The
   Version PR gets no CI of its own (GitHub runs no workflows on PRs created with `GITHUB_TOKEN`),
   which is why the gate runs on the push instead.
3. With npm auth configured (Option A or B) **and** `PUBLISH_ENABLED=true`, the Changesets action
   publishes `testpilot-qa@<version>` to `latest` once there are no pending changesets and the gate
   has passed. That happens on the push of the Version PR's merge, or immediately via **Run workflow**
   (`workflow_dispatch`, on `main` only). A red gate publishes nothing; see
   [if the gate fails](#merge-order-around-a-version-pr). Then run the [Post-publish](#post-publish)
   checks.

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
cd packages/cli && pnpm publish --tag latest --no-git-checks
```

npm refuses to publish a prerelease without an explicit `--tag`, and it has no "only-pre" rule, so
name the tag yourself. Use `latest` while every published version is an alpha, which matches what CI
does. After a stable release, use the pre tag instead (`--tag beta`). Use `pnpm publish`, not
`npm publish`: pnpm rewrites the `workspace:*` devDependencies, while npm would publish them literally.

```bash
# Then check what landed:
npm view testpilot-qa dist-tags
```

## Post-publish

**1. Confirm it is `latest`:** `npm view testpilot-qa version` should print the new version.

**2. Confirm how it was authenticated.** `npm view testpilot-qa@<version> _npmUser` shows a *person*
for a token publish and the GitHub Actions identity for a trusted publish. It must be GitHub Actions.
A person here means a token was used. Once the package disallows tokens, that cannot happen.

The npm registry can take several minutes to show a new version: alpha.3 returned 404 for about four
minutes after "packages published successfully". Wait before concluding a publish failed.

**3. Smoke the published package** from an empty directory: `npx testpilot-qa@<version> --version`,
`--help`, `init demo --yes`, then `analyze --reporter html --output report.html` inside `demo`.

- ✅ The `v0` Action tag exists. **Standing obligation:** re-point `v0` whenever `action/action.yml`
  changes (`git tag -f v0 <sha> && git push -f origin v0`).
