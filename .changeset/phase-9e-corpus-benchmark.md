---
"testpilot-qa": patch
---

Phase 9e — a corpus benchmark, so signal loss cannot ship quietly.

`pnpm bench` runs the built CLI against pinned commits of five real open-source Playwright suites
(cal.com, immich, Ghost, documenso, mattermost) and diffs the result against a committed baseline.

The gate is the **evidence that the analysis happened** — files opened, locator call sites extracted,
parse errors, discovery source, and whether the tool emitted a warning — not the findings count.
`findings` is by construction the sum of the per-rule counts, so it always moves when a rule changes;
"a rule row moved" says nothing about whether the change was intended. Findings and per-rule counts
are reporting, and the reviewer reads the table.

This is developer tooling; nothing in the published package changes. It exists because every
discovery defect found while building Phase 9 was caught by hand, one fixture at a time, invented
after the fact. The rule changes coming in Phase 11 will move these numbers a great deal, and the
point is that each move has to be looked at and explained rather than absorbed.
