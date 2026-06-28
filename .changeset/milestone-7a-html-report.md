---
"testpilot-qa": minor
---

Milestone 7A — local HTML analysis report.

`analyze --reporter html` writes a **single self-contained HTML file** — inline CSS, no external
assets, no scripts, no network, no tracking — that's easy to share or scan.

```bash
testpilot analyze --reporter html --output testpilot-report.html
```

The report shows the Locator Quality Score and grade, the four sub-scores, summary counts by severity,
and findings grouped by file (each with rule, location, message, snippet, and a docs link). It states
the **static Tier 1** scope plainly and makes no DOM-derived/auto-rewrite claims, and works for a clean
(zero-finding) project. All user-controlled content (file paths, snippets, messages) is HTML-escaped.

Like `json`, `html` is a **comprehensive** view: under `--baseline` it shows the full findings plus the
baseline summary (the gate-facing `table`/`sarif` outputs remain scoped to new findings). The reporter
is a pure function in the CLI presentation layer, mirroring the text and SARIF reporters. README,
CLI-Spec, Adoption-Plan, and Release-Checklist updated; `smoke:mvp` covers it end to end.
