---
"testpilot-qa": minor
---

Milestone 6B — CI & PR integration: SARIF reporter and a GitHub Action.

- **`analyze --reporter <table|json|sarif>`** chooses the output format for both stdout and
  `--output`. `sarif` emits a **SARIF 2.1.0** log so findings surface as GitHub code-scanning
  annotations at the exact file and line. An unknown reporter exits **2**. Back-compat: with no
  `--reporter`, `--json` or a bare `--output` still imply `json`; interactive runs default to `table`.
- SARIF results carry `partialFingerprints['testpilotIdentity/v1']` (the baseline identity), so code
  scanning tracks a finding across line moves instead of re-reporting it.
- A composite **GitHub Action** (`action/action.yml`, used as `faisal1024/testpilot-qa/action@v0`)
  wraps the CLI — it runs `analyze`, writes SARIF, and posts the human report to the PR job summary.
  It duplicates no analysis logic and pairs with `github/codeql-action/upload-sarif`. The local CLI
  remains fully usable without GitHub.

Static Tier 1 only — no DOM, no network, no LLM. README, CLI-Spec, Adoption-Plan, and Release-Checklist
updated; `smoke:mvp` covers the SARIF reporter end to end.
