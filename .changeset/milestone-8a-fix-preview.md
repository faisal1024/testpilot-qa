---
"testpilot-qa": minor
---

Milestone 8A — `testpilot fix`: safe mechanical fix preview.

A first, deliberately conservative step toward auto-fix. `fix` applies only **behavior-preserving,
syntactic** locator rewrites and is a **dry-run by default**.

```bash
testpilot fix            # preview a unified diff; writes nothing
testpilot fix --write    # apply the safe rewrites
```

- **Today's only fix:** `x.locator('text=Foo')` → `x.getByText('Foo')`. Playwright's string `getByText`
  does the same case-insensitive, trimmed, substring match as the `text=` engine, so this is
  behavior-identical. Quoted-exact (`text="Foo"`), regex (`text=/foo/`), chained (`>>`), dynamic
  (template), and unsafe-to-re-quote selectors are **left untouched**.
- **Safety:** dry-run prints a unified diff and writes nothing; `--write` applies. Fixes are
  **idempotent** and preserve line count. It scans the same files as `analyze` (patterns, or
  `config.testDir`/`include`), **never edits application code**, never calls an LLM, and **never** infers
  role/test-id locators from a string (that needs DOM evidence TestPilot doesn't use). Parse errors and
  unreadable files are skipped, never half-written.
- `--json` emits `{ command:'fix', dryRun, files[], summary }`; `--quiet` prints nothing.

New pure engine `computeFixes()` in `@testpilot/locator-intelligence` (AST-based, fully unit-tested) and
a line-aligned unified-diff renderer in the CLI. README, CLI-Spec (§3.3), Adoption-Plan, and
Release-Checklist updated; `smoke:mvp` covers preview → `--write` → idempotent.
