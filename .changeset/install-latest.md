---
'testpilot-qa': patch
---

**Install instructions now match how releases are actually published.** Every prerelease has been
published to npm's `latest`: Changesets does this for a package with no stable release, and rejects
`--tag` in pre-release mode. The docs, though, told you to install `@alpha`, a tag CI never moved. It
sat on `0.1.0-alpha.0` for three weeks after `alpha.2` shipped. The README and this npm page now use
`npm i -D -E testpilot-qa` (`-E` pins the exact version that resolved) and plain `npx testpilot-qa`.

The npm page's first-contact commands are also fixed:
- `analyze tests` becomes `analyze`. With a path argument it skipped your `playwright.config.*`, so it
  failed on a suite in `e2e/`.
- The HTML example gained the `--output` it needs to write a file instead of printing to the terminal.
