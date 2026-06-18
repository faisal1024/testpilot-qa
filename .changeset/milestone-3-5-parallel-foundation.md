---
"@testpilot/templates": minor
---

Milestone 3.5 — Parallel execution foundation + better sample tests (generated projects).

- The generated `playwright.config.ts` makes parallelism explicit: keeps `fullyParallel: true` and
  adds a documented `workers: process.env.CI ? 2 : undefined` (conservative in CI, Playwright's
  default locally; override with `--workers`).
- The generated `package.json` adds plain-Playwright scripts: `test:e2e`, `test:e2e:ui`
  (`tests/ui`), `test:e2e:api` (`tests/api`), `test:e2e:parallel` (`--workers=2`), `test:e2e:headed`.
- New offline UI sample `tests/ui/todo.spec.ts` — a small interactive todo list rendered via
  `page.setContent`, using `getByLabel`/`getByRole` and web-first assertions. Independent and
  parallel-safe (no shared mutable state).
- Generated README documents the run modes and that parallelism is Playwright's, not TestPilot's.

Playwright remains the runner — no custom parallel runner, sharding, or browser-matrix expansion.
`testpilot run` already forwards Playwright flags (e.g. `run -- --workers=2`) verbatim.
