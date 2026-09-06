---
"testpilot-qa": minor
"@testpilot/core": minor
"@testpilot/locator-intelligence": minor
---

Phase 9c — **analyze the page objects too, when you ask for them.**

Playwright's `testMatch` selects the files it *runs*, and most suites keep their locators somewhere
else. On the Ghost repository, `analyze` reports 94 files, 95 locator call sites and 2 findings — a
98 (A) — because its 130 page-object and helper files, which hold 114 of its 116 findings, are not
files Playwright runs. The grade was measuring what Playwright executes, not the suite's locator
quality.

`analyze --with-helpers` and `fix --with-helpers` include them; so does naming your own locations in
`includeHelpers`, which is itself the opt-in. The defaults cover `pages`, `page-objects`,
`pageobjects`, `pom`, `fixtures`, `helpers`, and `support`.

- They are scanned from the **config's directory**, not from `testDir` — helpers sit beside the test
  root far more often than inside it (Ghost's are in `e2e/helpers` while its tests are in `e2e/tests`,
  so scanning from the test root finds nothing).
- Findings carry **`inHelper: true`** and are counted in `summary.helperFiles` (schema **1.7**). "Your
  page object uses a CSS class" is a different conversation from "your test does", and folding them
  together would change what the score measures without saying so.
- **Off by default.** A score that quietly included files Playwright never runs would not be
  comparable to one that didn't.
- **A directory name is only a hint.** `pages/` is Next.js's and Nuxt's route directory, `helpers/` is
  Ember's — so a candidate must also *use* Playwright before it is analyzed. Without that gate,
  `fix --write` would rewrite application source; on cal.com it would have reached seven Next.js route
  files.
- **Helpers never rescue a failed run.** If the test scan matched nothing, the run still fails, rather
  than scoring the helper layer alone and turning a wrong `testDir` into a green gate.
- Findings are marked `[helper]` in the table and HTML, and carry a SARIF `properties.inHelper`, so a
  code-scanning reviewer is not shown a page-object finding as an ordinary test finding.
