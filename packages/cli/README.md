# testpilot-qa

> A local-first **Playwright quality toolkit** — static locator analysis, quality scoring, brownfield
> baselines, SARIF/HTML reports, safe narrow mechanical fixes, setup diagnostics, and AI-agent guidance.

**Public alpha.** Deterministic and offline: no network, no API key, no LLM calls. Everything it
generates is **ejectable plain Playwright** — zero lock-in.

> **TestPilot QA is not** a Playwright replacement, a general AI testing platform, an AI test generator,
> a self-healing locator tool, a hosted dashboard, an MCP server, or a broad auto-fix tool.

## Try it in 2 minutes

```bash
# New project: scaffold, then open a locator-quality report in your browser
npx testpilot-qa@alpha init demo --yes
cd demo
npx testpilot-qa@alpha analyze tests --reporter html
```

Already have a Playwright project? `analyze` is read-only — just point it at your tests:

```bash
npx testpilot-qa@alpha analyze tests              # human table (add --json for CI)

# Adopting on an existing suite? Record a baseline, then gate CI on NEW findings only:
npx testpilot-qa@alpha analyze tests --baseline testpilot-baseline.json --update-baseline
npx testpilot-qa@alpha analyze tests --baseline testpilot-baseline.json
```

## Commands

| Command | What it does |
|---|---|
| `init` | Scaffold a TypeScript Playwright project (UI + API examples + AI guidance files). |
| `run` | Thin pass-through to your local Playwright — not a custom runner. |
| `analyze` | Statically score locator quality and flag fragile patterns. Reports as table / JSON / SARIF / HTML. |
| `fix` | Apply safe, behavior-preserving locator rewrites. **Dry-run by default; `--write` to apply.** |
| `add ai` | Regenerate the AI agent guidance files. **Dry-run by default.** |
| `doctor` | Diagnose project readiness, setup problems, and AI-guidance drift. |
| `explain` | Explain a rule: why it matters, with bad/good examples. |

`fix` makes only safe, mechanical rewrites (today: `page.locator('text=Foo')` → `page.getByText('Foo')`),
never edits application code, never inspects the DOM, and makes no LLM calls. It is **not** broad auto-fix.

## Locator Quality Score

Every `analyze` run computes a deterministic 0–100 score (graded A–F). Gate CI with `--min-score <n>`.
The scoring model is fully documented (formula, weights, worked examples) in the repo.

## Docs & source

Full documentation, the scoring model, the GitHub Action, and the design docs live in the repository:
**https://github.com/faisal1024/testpilot-qa**

This is an alpha — published under the npm `alpha` dist-tag. Install a pinned alpha with
`npm i -D testpilot-qa@alpha`, or just use `npx testpilot-qa@alpha`.

## License

MIT © Faisal Islam
