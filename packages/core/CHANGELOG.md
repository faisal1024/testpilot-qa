# @testpilot/core

## 0.1.0-alpha.0

### Minor Changes

- 1afb2a5: Milestone 2.5 — harden the first-run experience.

  - **`testpilot init`** now scaffolds a complete `ui-api-fullstack` TypeScript Playwright project
    (package.json, `playwright.config.ts`, `testpilot.config.ts`, UI + API example tests, `.gitignore`,
    README, GitHub Actions workflow). Never overwrites existing files without `--force`; `--json` output.
  - **`testpilot run`** — a thin Playwright pass-through: locates the project, resolves the Playwright
    config, invokes the local Playwright binary, forwards args after `--`, and preserves the exit code.
    Not a custom runner.
  - **`@testpilot/core`** adds project discovery (`findProjectRoot`, `findPlaywrightConfig`,
    `resolvePlaywrightBin`) and the injectable Playwright runner. Config gains `playwrightConfig` and
    now **rejects unknown top-level keys**.
  - New packages graduate from stubs: **`@testpilot/scaffold`** (file generation, path-safe, overwrite
    protection) and **`@testpilot/templates`** (the template as data).

  Generated projects remain ejectable plain Playwright. No Locator Intelligence work included.

- 0c4951a: Milestone 2 — CLI Basics: add the global option surface (`--json`, `--config`, `--cwd`, `--yes`,
  `--quiet`, `--verbose`, `--no-color`) and `testpilot.config.ts` loading with upward discovery,
  zod validation, and sensible defaults. Project-oriented commands (`analyze`, `doctor`) now resolve
  config before their placeholder output. No feature logic yet.

  `testpilot-qa` now exposes a side-effect-free library entry (`main`/`exports`) that re-exports
  `defineConfig` and the config types, separate from the CLI `bin`, so a generated
  `testpilot.config.ts` can `import { defineConfig } from 'testpilot-qa'`. Invalid `--cwd`
  directories now fail with a clear `ConfigError` (exit 3) instead of silently using defaults.

- 7e899d9: Milestone 3A — Locator Intelligence foundation.

  - **`@testpilot/locator-intelligence`** graduates from a stub to the static-analysis engine:
    an AST parser (`@typescript-eslint/parser`), a locator extractor producing a `LocatorContext`
    per call-site, a pure-function rule engine, file resolution (config `include`/`testDir` or
    explicit globs), and an `analyze()` orchestrator that emits a stable, deterministic
    `AnalysisReport`. Two reference rules ship to exercise the pipeline (`no-xpath`,
    `no-css-class-selector`); the remaining locator rules land in 3B by adding registry entries.
  - **`@testpilot/core`** gains the shared analysis contract (`Finding`, `AnalysisReport`,
    `FindingSeverity`, `RuleCategory`).
  - **`testpilot analyze [patterns...]`** is now real: it parses configured test files and emits
    findings + summary, as a human table or stable `--json`. Severity is config-driven (`off`
    disables a rule). Reporting-only for now — score gating arrives with the scoring model.

  No DOM-aware suggestions, AI, auto-fix, MCP, SARIF/HTML reports, or public plugin API.

- 7086318: Milestone 3B — complete the MVP Tier 1 rule set and enrich analyze output.

  - Add four rules to `@testpilot/locator-intelligence`: `no-nth-child` (CSS `:nth-child()` and
    `.nth()` chains), `no-deep-css-chain` (conservative combinator-depth heuristic),
    `prefer-user-facing-locator` (raw css/text `locator()` → category guidance), and `no-hard-wait`
    (`waitForTimeout`, a flakiness rule). The MVP Tier 1 set is now all six rules.
  - Extend the extractor to recognize `.nth()` and `waitForTimeout` call-sites and to point finding
    locations at the method name (precise in chains). Non-string literal args (e.g. `.nth(2)`) are
    treated as static, not dynamic.
  - Enrich the analysis report (`schemaVersion` `1.1`): unknown rule ids in config now surface as
    `warnings`, and unparseable files are reported in `parseErrors` (with a `filesWithParseErrors`
    count) instead of failing the command.
  - Every rule honors config severity overrides and `off`. Rules give category-level guidance only.

  Still Tier 1 / reporting-only: no DOM suggestions, AI, auto-fix, MCP, SARIF/HTML, plugin API, or
  scoring. `analyze` exits 0; `--min-score` gating is Milestone 3C.

- cb13c67: Milestone 3C — Locator Quality Score and CI gating.

  - Add a deterministic, static **Locator Quality Score** (0–100) with letter grades (A ≥90, B ≥80,
    C ≥70, D ≥60, F <60) and four sub-scores: Resilience (locator rules), Flakiness (flakiness rules),
    Accessibility and Maintainability (100 until such rules exist). Model: `penalty = Σ severity weight`,
    `maxPenalty = call-sites × error weight`, `score = clamp(round(100 × (1 − penalty/maxPenalty)), 0, 100)`,
    using `config.scoring.weights`. Zero call-sites → 100/A. The score is included in human and JSON
    output (`schemaVersion` → `1.2`, new top-level `score`).
  - Add **`testpilot analyze --min-score <n>`**: exits non-zero (1) with a clear message when the score
    is below the threshold; exits 0 otherwise. Precedence: `--min-score` flag → `config.scoring.minScore`
    → no gating. `config.scoring.minScore` is now optional (no default) so analyze does not gate unless asked.
  - Parse errors are reported but do not affect the score in this milestone.

  Scoring logic lives in `@testpilot/locator-intelligence` (`computeScore`/`gradeFor`); the CLI stays
  thin. Still Tier 1 / static — no DOM, AI, auto-fix, SARIF/HTML, baseline, `--changed`, or plugin API.
  No new rules added.

- 41a16cb: Milestone 4A — `testpilot explain <ruleId>` rule education.

  - `testpilot explain <ruleId>` is now real for all six MVP Tier 1 rules. Human output shows the id,
    default severity, category, title, summary, why it matters, a ✗ bad example, a ✓ better example,
    guidance, and a docs URL; `--json` emits the same fields as a stable object. An unknown rule id
    prints a clear error listing the available rules and exits 2.
  - Structured `RuleExplanation` metadata lives in `@testpilot/locator-intelligence`
    (`ruleExplanations` / `getExplanation` / `explanationIds`), with id/category/severity/docsUrl
    sourced from each rule so they cannot drift. The `RuleExplanation` type is in `@testpilot/core`.
  - CLI stays thin: the command looks up data and renders it; no rule content is hardcoded in the CLI.

  Tier 1 / static: examples are self-contained illustrations and never claim knowledge of the user's
  DOM. No auto-fix, no DOM-derived replacements, no AI.

- f311fff: Milestone 4B — `testpilot doctor`.

  - `testpilot doctor` diagnoses project readiness and common setup issues: Node.js version,
    `package.json` presence, local Playwright install, Playwright config discovery,
    `testpilot.config.ts` validity, test-directory existence, include-pattern sanity, and TestPilot
    project structure. AI guidance-file drift is reported as "not checked yet" (the generator lands
    later — no faked drift).
  - Human report (overall pass/warn/fail + per-check id/title/category/status/message/remediation +
    deduped next actions) and stable `--json` (`schemaVersion` `1.0`). Respects `--cwd`/`--config`/
    `--json`/`--quiet`.
  - CI-friendly exit codes: `0` (no hard problems; warnings allowed), `3` (invalid config — takes
    precedence), `4` (environment/project setup problems), `5` (unexpected internal error).
  - Diagnosis logic lives in `@testpilot/core` (`runDoctor`) so future GitHub Actions, agents, and a
    programmatic API can reuse it; the CLI handler stays thin.

  With this, all five MVP commands are implemented. Removed the now-dead `not-implemented` placeholder
  helper and its exit code. No network calls, no LLM, no auto-fix, no DOM-aware analysis.

- e1fb936: Milestone 5A — AI agent guidance generation.

  - `@testpilot/ai` defines the TestPilot + Playwright guidance **once** (`CANONICAL_GUIDANCE`) and
    deterministically generates four agent files from it: `CLAUDE.md`, `AGENTS.md`,
    `.github/copilot-instructions.md`, and `.cursor/rules/testpilot-playwright.mdc`. Offline, no LLM.
  - Each file carries a generated marker with a version + content hash (`@testpilot/guidance v1
sha256:…`). Exported helpers (`parseGuidanceMarker`, `extractGeneratedBody`, `isGuidancePristine`)
    set up Milestone 5B's `doctor` drift detection.
  - `testpilot init` now scaffolds these files by default. They flow through the existing
    overwrite-protection path: missing files are created, existing files are skipped (reported in
    human and JSON output), and `--force` overwrites — consistent with the rest of the scaffold.
  - Config: `ai.agents` now defaults to all supported agents (`claude`, `codex`, `cursor`, `copilot`);
    `scaffoldProject` accepts an `agents` option.

  Guidance is honest about Tier 1 limits — no DOM-aware suggestions, no auto-fix, no AI-generated
  tests, no LLM calls. Playwright remains the runner.

- 960e717: Milestone 5B — `doctor` AI guidance drift detection (detection only).

  - `@testpilot/ai` adds pure, deterministic `classifyGuidanceFile(agent, content)` →
    `current` / `missing` / `edited` / `stale` / `no-marker`, plus `selectedAgents()`.
  - `testpilot doctor`'s `ai-guidance` check is now real: for the agents selected by
    `config.ai.agents` (default: all four), it reads each expected file and reports drift, with a
    per-file structured breakdown in `check.details.files` (agent, path, state, reason, expected vs.
    marker version/hash). Replaces the previous "not checked yet" stub.
  - Drift is a **warning, never a hard failure** — it never changes the exit code by itself. The check
    is read-only and never regenerates or overwrites anything.
  - `DoctorCheck` gains an optional `details` field (backwards-compatible; existing JSON unchanged).

  Respects `--cwd`/`--config`; invalid config still exits 3. Regeneration (`testpilot add ai`) remains
  out of scope. No LLM, auto-fix, DOM analysis, or network.

- 558a498: Milestone 6A — brownfield baseline & report output for `analyze`.

  - **`--output <path>`** writes the full JSON report to a file (creating parent directories) instead
    of stdout, confirming with `Report written to <path>.`.
  - **`--baseline <path>`** compares the current findings to a saved baseline and gates on _new_
    findings only — exit **1** when a regression appears, exit **0** when every current finding is
    grandfathered in. A finding's baseline identity is `ruleId + file + snippet`
    (line/column/severity-independent), so moving code or re-grading a rule never resurfaces an accepted
    finding; duplicate occurrences are counted, so an extra duplicate beyond the baseline count is new.
  - **`--update-baseline`** (requires `--baseline`) records the current findings to that path and exits
    **0** without gating.
  - When `--baseline` is active, the JSON report gains a `baseline` block
    (`{ path, newFindings, baselinedFindings }`); `ANALYSIS_SCHEMA_VERSION` bumps to **1.3**.
  - Missing/malformed baseline files and unwritable `--output`/`--baseline` paths exit **2** (usage)
    with a clear message.
  - **`@testpilot/core`** adds the pure baseline module (`buildBaseline`, `compareToBaseline`,
    `findingKey`, and the `Baseline`/`BaselineEntry`/`BaselineComparison`/`BaselineReport` types).

  Still Tier 1 / static — no DOM, no network, no LLM. README and CLI spec updated; smoke:mvp covers the
  new flags end to end.

### Patch Changes

- Updated dependencies [e1fb936]
- Updated dependencies [960e717]
  - @testpilot/ai@0.1.0-alpha.0
