---
'testpilot-qa': patch
---

**The GitHub Action no longer analyzes a silently reduced set of files.** Its `patterns` input was
split with an unquoted bash expansion, so bash globbed each pattern against the runner's checkout
before the CLI saw it. Without `globstar`, `**` means `*`, so `tests/**/*.spec.ts` matched only
files exactly one directory down. The top-level and deeper files were dropped, and both the score
and the `--baseline` gate covered a subset nobody chose, with nothing to say so. Patterns are now
passed through verbatim — split on spaces, tabs and newlines, so a `patterns: |` block with one glob
per line works — and the CLI does the matching, exactly as when you run it yourself.

**If you set `patterns`, the analyzed set can change in either direction:**
- `**` patterns now cover every level, so they may match **more** files than before.
- A single `*` now matches one level only. Before, bash expanded `tests/*` into its subdirectories, and
  the CLI scanned each of those recursively. Now `tests/*` matches only files directly in `tests/`,
  and `e2e/*` over a suite with only subdirectories fails with "No test files matched". Use the
  directory (`tests`) or `tests/**/*.spec.ts` to cover everything below it.

This fix ships in the Action, not in the npm package: `@v0` picks it up when the tag is re-pointed. If
you pinned the Action by commit SHA, update the SHA.
