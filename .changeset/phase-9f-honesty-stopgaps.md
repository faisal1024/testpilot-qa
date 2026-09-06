---
"testpilot-qa": minor
"@testpilot/core": minor
"@testpilot/locator-intelligence": minor
---

Phase 9f — say what the score does not cover.

- **`analyze` reports a page-object layer it did not analyze** (`helpers-not-analyzed`). Most suites
  keep most of their locators in page objects, which Playwright's `testMatch` never runs: Ghost's
  `98 (A)` is measured over 95 of its 768 locator call sites. That number was never wrong — it was
  about the wrong files, silently. It now arrives with "73 page object/fixture file(s) use Playwright
  but were not analyzed", and goes quiet once you pass `--with-helpers`.
- **README gains a "Known limitations" section**: `prefer-user-facing-locator` over-fires (≈65% of all
  findings on a five-repo survey, roughly half of them wrong) with the config line to set it to
  `info`; the score is a trend within a repo rather than a bar between repos, and `--baseline` is the
  honest gate today; Accessibility and Maintainability sub-scores are always `100 A` because no rule
  feeds them; `no-hard-wait` overlaps `eslint-plugin-playwright`.
- **`analyze --help`, `fix --help` and `doctor --help` list the global flags.** Commander shows a
  subcommand's own options only, so `--json` — which the README uses — appeared nowhere.
- **Issue templates** for bugs and false positives, both requiring the snippet. Phase 11's rule work
  calibrates against real false positives, so the loop that collects them opens first.
