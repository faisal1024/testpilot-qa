---
'testpilot-qa': patch
---

**Install `testpilot-qa`, not `testpilot-qa@alpha`.** Every alpha after the first is published to npm's `latest`:
Changesets does that for a package whose published versions are all prereleases, and it rejects
`--tag` in pre-release mode. The first docs said to install `@alpha`. CI set that tag at the first
publish and cannot move it, so it stayed on `0.1.0-alpha.0` for three weeks after `alpha.2` shipped.
The README and this npm page now say `npm i -D -E testpilot-qa` (`-E` pins the exact version that
resolved) and plain `npx testpilot-qa`.

**The `alpha` dist-tag is being removed after this release.** A tag nobody moves serves an old build
without telling you. Once it is gone, `testpilot-qa@alpha` and the Action's `version: alpha` fail with
"No matching version" instead. Switch to `testpilot-qa` (or pin an exact version), and use
`version: latest` (the default) in the Action.

The npm page's first-contact commands are also fixed:
- `analyze tests` becomes `analyze`. With a path argument it skipped your `playwright.config.*`, so it
  failed on a suite in `e2e/`.
- The HTML example gained the `--output` it needs to write a file instead of printing to the terminal.
