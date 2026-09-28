---
'@testpilot/locator-intelligence': patch
'@testpilot/core': patch
'testpilot-qa': patch
---

**`includeHelpers` works as documented.** Naming your page objects is how you opt into analyzing
them. But an entry like `'pages/**'` was matched against absolute paths, so it matched nothing, and
those page objects were never analyzed. Adding `--with-helpers` didn't help either: a named list
replaces the conventional directories, so the flag analyzed zero helper files, while the report said
"Add --with-helpers to include them". Only `**/`-anchored and absolute entries worked.

An `includeHelpers` list now resolves from the directory of your `testpilot.config.ts`, and only
from there. That holds even when discovery adopts `e2e/playwright.config.ts`: `'pages/**'` means
your `pages/`, not `e2e/pages/`.
- A bare directory (`'pages'`) means everything under it. Only source files (`.ts`, `.js`, …) are
  ever treated as page objects, whatever the glob matches.
- `'!pages/legacy/**'` excludes. Before, a `!` entry matched nearly every file in the project.
- Files outside the config's directory (a `../` entry or a symlink) are never analyzed, and so
  never rewritten by `fix --write`.

**If you set `includeHelpers`, results change:**
- The page objects you named are now analyzed, so **your score and `--min-score` gate can move**.
- Their findings are new to a `--baseline` recorded before this release, so **re-record the
  baseline** (`--update-baseline`).
- `fix` now also rewrites those files.

Also fixed:
- An entry that matches no file at all is reported, in `analyze` and in `fix` (warning
  `include-helpers-unmatched`, report schema **1.13**). A misspelt entry otherwise looks exactly
  like a project with no page objects.
- With a named list, the "not analyzed" warning tells you to extend the list instead of suggesting
  a flag that changes nothing. With explicit patterns, it tells you to name them there.
- `tags` and `doctor` no longer count page objects as test files. A named list admitted them without
  the flag, and they showed up as "no tests recognized" and as an incomplete tag vocabulary.
- The conventional directory names are matched below the project, not against the absolute path, so
  a checkout inside a directory called `fixtures/` or `pages/` no longer turns every file into a page
  object.
