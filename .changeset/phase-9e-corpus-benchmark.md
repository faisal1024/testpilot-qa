---
"testpilot-qa": patch
---

Phase 9e — a corpus benchmark, so signal loss cannot ship quietly.

`pnpm bench` runs the built CLI against pinned commits of five real open-source Playwright suites
(cal.com, immich, Ghost, documenso, mattermost) and diffs files, findings-by-rule, score, and
warnings against a committed baseline. **A narrowed scan fails the run** — fewer files analyzed, or
findings vanishing with no accompanying rule change — because that is the one regression the score
itself cannot reveal.

This is developer tooling; nothing in the published package changes. It exists because every
discovery defect found while building Phase 9 was caught by hand, one fixture at a time, invented
after the fact. The rule changes coming in Phase 11 will move these numbers a great deal, and the
point is that each move has to be looked at and explained rather than absorbed.
