# TestPilot QA — Remaining Work Handoff

> Audience: Claude Code working in `faisal1024/testpilot-qa`
> Role assumption: You are implementing under product-owner review. Keep PRs small, focused, and held for Codex review before merge.
> Current posture: Private repo preparing for public alpha. Do not overbuild. Trust and adoption matter more than feature breadth.

---

## Product Positioning

TestPilot QA is an **AI-agent-ready Playwright quality toolkit**.

It is not:

- a test framework;
- a Playwright replacement;
- an AI test-generation platform;
- a self-healing test runner;
- a hosted dashboard.

It should help users:

- scaffold a sane Playwright project;
- run plain Playwright through a thin wrapper;
- analyze fragile locators and flaky waits;
- understand quality through score/reporting;
- explain rule findings;
- diagnose setup problems;
- keep AI coding agents aligned with good Playwright conventions.

Use honest language:

- "local-first";
- "deterministic";
- "Playwright-native";
- "static Tier 1 analysis";
- "AI-agent guidance";
- "brownfield no-regression workflow".

Avoid unsupported claims:

- "self-healing";
- "AI-generated tests";
- "DOM-aware locator repair";
- "automatic locator replacement";
- "replace Playwright".

---

## Current Completed Work

Completed or in progress through Milestone 5B:

- repo foundation, monorepo, package boundaries;
- CI gate;
- CLI shell and global options;
- `testpilot init`;
- `testpilot run` as a thin Playwright pass-through;
- generated UI/API sample tests and parallel-friendly scripts;
- `testpilot analyze`;
- six MVP static rules *(as shipped in Milestone 3B — the set is nine as of Phase 11, and
  `prefer-user-facing-locator` has since split; see [the rule index](rules/README.md))*:
  - `no-xpath`;
  - `no-css-class-selector`;
  - `no-nth-child`;
  - `no-deep-css-chain`;
  - `prefer-user-facing-locator`;
  - `no-hard-wait`;
- Locator Quality Score and `--min-score`;
- `testpilot explain`;
- `testpilot doctor`;
- `pnpm smoke:mvp`;
- canonical AI guidance generation;
- AI guidance drift detection in `doctor`;
- `docs/Adoption-Plan.md`.

Before continuing, pull latest `main` and read:

- `README.md`;
- `docs/Adoption-Plan.md`;
- `docs/Roadmap.md`;
- `docs/Release-Checklist.md`;
- `docs/CLI-Spec.md`;
- `docs/AI-Agent-Integration.md`.

---

## Global Rules For All Remaining PRs

Every PR must:

- update `README.md` when user-facing behavior or positioning changes;
- keep Playwright as the runner;
- avoid network calls unless explicitly scoped;
- avoid LLM calls;
- avoid broad rewrites;
- include tests for new behavior;
- keep JSON contracts stable unless explicitly versioned;
- run:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm -r build
corepack pnpm smoke:mvp
```

When relevant, also run:

```bash
corepack pnpm smoke:package
```

Every PR should be held for Codex review before merge.

---

## Milestone 5C — Public Alpha Hardening

### Goal

Prepare the private repo for a credible public alpha by proving the package/install path, adding a realistic example, and tightening public-facing positioning.

### Scope

1. Add package smoke testing.
2. Add a realistic fragile-suite example.
3. Update README alpha positioning.
4. Update release checklist.
5. Clarify dependency PR strategy.

### Required Work

#### 1. Package Smoke

Add:

- `scripts/smoke-package.mjs`;
- package script: `smoke:package`.

It should run after `corepack pnpm -r build` and:

- create a temp directory;
- produce a local package tarball with `npm pack` or equivalent;
- install the packed package into a fresh temp project;
- invoke the installed CLI like a consumer would;
- verify:
  - `testpilot --help`;
  - `testpilot --version`;
  - `testpilot explain no-xpath --json`;
  - `testpilot init demo --yes --json`;
  - generated AI guidance files exist;
  - rerunning `init` skips existing files;
  - `testpilot doctor --cwd demo --json`;
  - `testpilot analyze --cwd demo --json`.

Do not download browsers. Do not run browser tests.

#### 2. Example Fixture

Add:

- `examples/fragile-suite/README.md`;
- one or more sample `.spec.ts` files.

The example should intentionally include:

- one XPath locator;
- one CSS class selector;
- one hard wait;
- one good locator example.

The example README should show:

```bash
node ../../packages/cli/dist/cli.js analyze . --json
```

or the equivalent installed-package command.

#### 3. Example Smoke

Extend `smoke:mvp` or add a focused check to ensure:

- `analyze` finds expected findings in `examples/fragile-suite`;
- JSON output parses;
- score exists.

#### 4. Public Alpha Positioning

Update README to say:

- this is alpha-ready, not a finished platform;
- TestPilot does not replace Playwright;
- current supported surface:
  - `init`;
  - `run`;
  - `analyze`;
  - `doctor`;
  - `explain`;
  - AI guidance generation/drift detection;
- not included yet:
  - auto-fix;
  - DOM-aware suggestions;
  - dashboards;
  - HTML/SARIF reports;
  - MCP;
  - LLM calls;
  - AI-generated tests.

#### 5. Release Checklist

Update `docs/Release-Checklist.md` to include:

- `corepack pnpm smoke:package`;
- what it proves;
- when to run it;
- how it differs from `smoke:mvp`.

### Verification

Run:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm -r build
corepack pnpm smoke:mvp
corepack pnpm smoke:package
```

### PR Title

```text
chore: public alpha hardening and package smoke (Milestone 5C)
```

---

## Milestone 5D — Dependency PR Cleanup

### Goal

Clean public repo optics before alpha launch by handling Dependabot PRs deliberately.

### Scope

Do not batch risky major upgrades.

Likely safe to merge individually if green:

- GitHub Action bumps;
- `@types/node` if typecheck passes.

Handle separately and carefully:

- `commander` major;
- `zod` major;
- TypeScript major;
- Biome major.

### Required Work

For each dependency PR:

1. Rebase/update on latest main.
2. Run full gate.
3. Run `smoke:mvp`.
4. Run `smoke:package` if available.
5. For `commander`, manually verify CLI parsing for:
   - global options before command;
   - global options after command;
   - `run -- <playwright args>`;
   - `--quiet`;
   - `--json`.
6. For `zod`, manually verify config loading and invalid config errors.
7. For Biome, migrate config if needed.

### PR Strategy

One dependency PR at a time. Do not merge red PRs. Close or defer failing major bumps if they are not worth fixing before public alpha.

---

## Milestone 6A — Brownfield Baseline And Output

### Goal

Make TestPilot useful for existing Playwright suites by allowing teams to adopt without fixing all legacy debt immediately.

### Scope

Add:

- `analyze --output <path>`;
- baseline file support;
- no-regression gate.

### Required Behavior

#### `--output`

`testpilot analyze --json --output testpilot-report.json`

Should:

- write the JSON report to the file;
- preserve stdout behavior intentionally:
  - either print a short human message;
  - or print nothing with `--quiet`;
- fail clearly if output path cannot be written.

#### Baseline

Add a baseline command or option. Choose conservatively after reading current CLI patterns.

Acceptable shape:

```bash
testpilot analyze --json --output testpilot-report.json
testpilot analyze --baseline testpilot-baseline.json
testpilot analyze --update-baseline
```

or:

```bash
testpilot baseline create
testpilot analyze --baseline testpilot-baseline.json
```

The baseline should let teams:

- record current known findings;
- fail only on new findings;
- avoid blocking adoption on legacy debt.

### Key Design Rules

- The finding identity must be stable enough for baseline comparison.
- Do not hide parse errors.
- Do not silently update baseline unless explicitly requested.
- Keep JSON output deterministic.
- Document whether line-number movement affects identity.

### Tests

Cover:

- output file writing;
- unwritable output path;
- baseline with no new findings exits 0;
- baseline with new finding exits 1;
- baseline update writes expected file;
- changed severity or rule id behavior;
- JSON report includes baseline/delta information.

### Docs

Update:

- README;
- `docs/CLI-Spec.md`;
- `docs/Adoption-Plan.md`;
- `docs/Release-Checklist.md` if gate changes.

### PR Title

```text
feat: add brownfield baseline and analyze output (Milestone 6A)
```

---

## Milestone 6B — CI And PR Integration

### Goal

Make TestPilot natural to run in pull requests.

### Scope

Add:

- SARIF reporter or SARIF output mode;
- GitHub Action wrapper;
- PR-friendly summary.

### Required Behavior

Support a flow like:

```bash
testpilot analyze --baseline testpilot-baseline.json --reporter sarif --output testpilot.sarif
```

and/or a GitHub Action:

```yaml
- uses: faisal1024/testpilot-qa/action@v0
  with:
    min-score: 80
    baseline: testpilot-baseline.json
```

Exact action shape can be designed in this milestone.

### Key Design Rules

- Keep local CLI usable without GitHub.
- GitHub Action should wrap the CLI/programmatic API, not duplicate analysis logic.
- SARIF must map findings to files/locations/rules correctly.
- Do not require hosted services.

### Tests

Cover:

- SARIF parses as valid JSON;
- expected rule metadata exists;
- file locations are correct;
- action docs/examples are accurate.

### Docs

Update:

- README;
- `docs/CLI-Spec.md`;
- `docs/Release-Checklist.md`;
- `docs/Adoption-Plan.md`.

### PR Title

```text
feat: add CI and PR integration foundation (Milestone 6B)
```

---

## Milestone 6C — Safe AI Guidance Regeneration

### Goal

Give users a narrow safe command to regenerate AI guidance files without running broad scaffold overwrite.

### Scope

Implement:

```bash
testpilot add ai
testpilot add ai claude
testpilot add ai all
```

or another focused shape consistent with the CLI spec.

### Required Behavior

- Generate only AI guidance files.
- Respect `config.ai.agents`.
- Never overwrite user-edited files unless explicitly requested.
- Use marker/hash drift detection from `doctor`.
- Support dry-run by default if practical.
- Support `--write` or `--force` for actual overwrite.
- Report:
  - created;
  - skipped;
  - would update;
  - user-edited;
  - stale;
  - current.

### Key Design Rules

- Do not call LLMs.
- Do not regenerate tests.
- Do not touch scaffold files.
- Prefer explicit user intent before overwriting.

### Tests

Cover:

- missing file created;
- current file skipped;
- stale generated file updated with explicit write/force;
- user-edited file not overwritten by default;
- selected agent subset;
- JSON output;
- quiet behavior.

### Docs

Update:

- README;
- `docs/AI-Agent-Integration.md`;
- `docs/CLI-Spec.md`;
- `docs/Adoption-Plan.md`.

### PR Title

```text
feat: add safe AI guidance regeneration (Milestone 6C)
```

---

## Milestone 7A — HTML Report

### Goal

Create a shareable local report that makes TestPilot easier to demo and easier for teams to scan.

### Scope

Add:

```bash
testpilot analyze --reporter html --output testpilot-report.html
```

### Required Content

Report should include:

- Locator Quality Score and grade;
- sub-scores;
- findings grouped by file/rule/severity;
- rule explanations or links;
- summary counts;
- clear "static Tier 1 only" language;
- no DOM-derived rewrite claims.

### Key Design Rules

- Static HTML file only.
- No hosted service.
- No tracking.
- No external assets required.
- Keep the reporter package boundary clean.

### Tests

Cover:

- HTML file writes;
- contains score;
- contains findings;
- escapes user-controlled content;
- works with zero findings.

### PR Title

```text
feat: add local HTML analysis report (Milestone 7A)
```

---

## Milestone 7B — Score Calibration Docs

### Goal

Make the Locator Quality Score understandable and trustworthy.

### Scope

Add docs and examples showing:

- how severity weights affect score;
- how call-site count affects score;
- why zero call-sites scores 100;
- how fixing findings changes the score;
- what A/B/C/D/F means;
- examples of fragile vs healthy files.

### Required Work

Add:

- `docs/Scoring.md` or equivalent;
- links from README and CLI spec;
- tests only if docs examples are executable or generated.

### PR Title

```text
docs: explain locator quality scoring (Milestone 7B)
```

---

## Milestone 8A — Safe Mechanical Fix Preview

### Goal

Begin auto-fix carefully, with dry-run previews and only low-risk mechanical changes.

### Scope

Initial command:

```bash
testpilot fix [globs...]          # dry-run only by default
testpilot fix [globs...] --write  # write approved mechanical fixes
```

### Allowed Early Fixes

Only include fixes that are very unlikely to change behavior. Candidate examples:

- maybe simple `locator('text=Submit')` to `getByText('Submit')` if parser support is reliable;
- maybe hard-wait TODO annotation rather than behavior-changing replacement.

Do not rewrite CSS/XPath into role locators without DOM context.

### Key Design Rules

- Dry-run by default.
- Show unified diff.
- Require `--write`.
- Idempotent.
- Never change app code.
- No DOM-derived claims.

### Tests

Cover:

- dry-run diff;
- write mode;
- idempotency;
- unsupported findings are skipped;
- no accidental rewrites.

### PR Title

```text
feat: add safe fix preview foundation (Milestone 8A)
```

---

## Later V2 Work — DOM-Aware Analysis

Do not start this until static/brownfield/CI adoption is solid.

Future scope:

- Playwright trace or DOM snapshot ingestion;
- locator uniqueness validation;
- exact role/name/test-id suggestions backed by DOM evidence;
- optional `fix --dom` after validation;
- possible MCP tools after DOM-aware suggestions exist.

Main rule:

> Static guesses must never masquerade as DOM-backed facts.

---

## Recommended Public Timing

Make the repo public as an alpha after:

1. Milestone 5C is merged.
2. Dependency PR optics are cleaned up.
3. Package smoke passes.
4. README alpha positioning is honest.
5. `examples/fragile-suite` demonstrates value.

Do a soft public alpha first:

- no Product Hunt / large launch;
- share with a few Playwright/QA/dev peers;
- ask for feedback on analyzer findings, scoring, and AI guidance;
- watch for false positives.

Move toward broader beta after:

- baseline/no-regression support;
- GitHub Action or SARIF;
- clear brownfield adoption docs.

---

## Copy-Paste First Prompt For Claude

Use this prompt for the next work item:

```text
You are working in faisal1024/testpilot-qa.

Implement Milestone 5C: Public alpha hardening and package smoke.

Read docs/Adoption-Plan.md first and follow its sequencing. This milestone prepares the private repo
for a credible public alpha. Do not implement baseline, SARIF, GitHub Action, auto-fix, DOM-aware
analysis, AI-generated tests, MCP, dashboards, or Playwright replacement behavior.

Required:
1. Add scripts/smoke-package.mjs and package script smoke:package.
2. The package smoke must build/package/install the local package into a temp consumer project and
   verify the installed CLI can run help/version/explain/init/doctor/analyze.
3. Add examples/fragile-suite with intentionally fragile Playwright tests and a README.
4. Ensure analyze finds no-xpath, no-css-class-selector, and no-hard-wait in that example.
5. Update README with honest public-alpha positioning.
6. Update docs/Release-Checklist.md with smoke:package.
7. Update docs/Adoption-Plan.md only if needed to mark 5C as active/in progress.
8. Do not merge dependency PRs in this milestone.

Verification:
- corepack pnpm install --frozen-lockfile
- corepack pnpm lint
- corepack pnpm typecheck
- corepack pnpm test
- corepack pnpm -r build
- corepack pnpm smoke:mvp
- corepack pnpm smoke:package

Open a PR titled:
chore: public alpha hardening and package smoke (Milestone 5C)

Hold for Codex review before merge.
```

