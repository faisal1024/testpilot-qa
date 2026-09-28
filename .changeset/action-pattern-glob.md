---
'testpilot-qa': patch
---

**The GitHub Action no longer analyzes a silently reduced set of files.** Its `patterns` input was
split with an unquoted bash expansion, so bash globbed each pattern against the runner's checkout
before the CLI saw it. Without `globstar`, `**` means `*`, so `tests/**/*.spec.ts` matched only
files exactly one directory down. The top-level and deeper files were dropped, and both the score
and the `--baseline` gate covered a subset nobody chose, with nothing to say so. Patterns are now
passed through verbatim, and the CLI does the matching. If you set `patterns`, your gate may now
cover more files than before. If you pinned the Action by commit SHA rather than `@v0`, update it
to pick up this fix.
