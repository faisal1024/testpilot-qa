# TestPilot QA — Milestone 1 Implementation Plan

> Status: **Awaiting approval** — do not execute until approved.
> Scope: **Repository foundation only.** No feature code. No Locator Intelligence. No AI integration logic.
> Corresponds to Roadmap **Phase 1 (Foundation & CLI Shell)**.

---

## 1. Objective

Stand up a clean, buildable, testable pnpm monorepo with locked package boundaries, TypeScript
config, a working CLI **shell** (`--help`, `--version`, and placeholder handlers for `init`,
`analyze`, `doctor`, `explain`), and full GitHub repository standards.

At the end of Milestone 1:
- `pnpm install && pnpm build && pnpm test && pnpm lint && pnpm typecheck` all pass.
- `node packages/cli/dist/index.js --version` prints the version.
- `testpilot --help` lists the four MVP commands.
- Each command prints a clear **"not yet implemented — coming in Milestone N"** message and exits non-zero with a documented code.
- CI runs the full gate on every PR.

## 2. Explicit Non-Goals (do **not** build in Milestone 1)

- ❌ No `init` scaffolding logic, templates, or file generation.
- ❌ No AST parsing, `LocatorContext`, rules, or scoring.
- ❌ No AI guidance-file generation.
- ❌ No `doctor`/`explain` real logic — placeholders only.
- ❌ No `fix`, ESLint plugin, CI reporter, SARIF, MCP, DOM, or docs portal.
- ❌ No publishing to npm (release tooling is *configured* but not run).

---

## 3. Tooling Decisions (confirm at approval)

| Concern | Recommendation | Rationale | Reversible? |
|---|---|---|---|
| Package manager | **pnpm** workspaces | Fast, strict, ideal for many small packages. | Hard to change later. |
| Language / module | **TypeScript 5.x, ESM-only**, Node ≥ 20 LTS | Matches Playwright baseline; ESM is the modern default; a CLI has no CJS consumers. | Medium (can add CJS via tsup). |
| Monorepo orchestration | **pnpm recursive scripts** (`pnpm -r`) | Simplest thing that works. Turborepo deferred until build times justify caching. | Easy. |
| Build | **tsup** (esbuild) per package, emits JS + `.d.ts` | Fast, near-zero config, handles the CLI `bin` shebang. | Easy. |
| Typecheck | **`tsc --build`** (project references, `noEmit`) | Type-safety gate independent of bundling. | Easy. |
| Test | **Vitest** + v8 coverage | Fast, TS-native, great DX. | Easy. |
| Lint + format | **Biome** (one tool) | Single fast binary, minimal config — favors simplicity. *Orthogonal* to the analyzer's `@typescript-eslint/parser` (a runtime dep) and the future `eslint-plugin-testpilot` (which targets **users'** repos, not this one). | Easy. |
| Release | **Changesets** + npm provenance | Standard monorepo versioning; configured now, runs later. | Easy. |
| Git hooks | **husky + lint-staged** (format/lint staged files) | Cheap quality gate; kept minimal to avoid contributor friction. | Easy. |
| Commits | **Conventional Commits** (convention only; commitlint optional) | Enables changelog automation later. | Easy. |
| License | **MIT** | Maximum adoption for a dev tool. *Alternative: Apache-2.0 if an explicit patent grant matters for enterprise.* | Hard once published. |

**Two decisions worth an explicit yes/no before we start:** (1) Biome vs. ESLint+Prettier, and
(2) MIT vs. Apache-2.0. Both are cheap now and expensive to flip later.

---

## 4. Package Boundaries

Seven packages are created now so the **dependency graph and naming are locked early** (prevents
churn). Only `core` and `cli` carry real (non-feature) content in Milestone 1; the other five are
**reserved-boundary stubs** — a valid `package.json`, `tsconfig.json`, and a placeholder
`src/index.ts` that builds, but no logic.

```
@testpilot/core               leaf — shared types/version (no deps)
@testpilot/cli            →   depends on core (the command shell)
@testpilot/locator-intelligence   stub (Phase 3)
@testpilot/scaffold               stub (Phase 2)
@testpilot/templates              stub (Phase 2)
@testpilot/ai                     stub (Phase 2/6)
@testpilot/reporters              stub (Phase 3/5)
```

> **Challenge / alternative:** creating five empty packages risks "ghost package" overhead. The
> cheaper alternative is to create only `core` + `cli` now and add each package in its own phase.
> Recommendation: **lock all seven boundaries now** — the cost is tiny, and a stable dependency
> graph is worth more than avoiding five 6-line stub files. Open to reversing this at approval.

---

## 5. Target File Tree (end of Milestone 1)

```
testpilot-qa/
├─ .changeset/
│  └─ config.json
├─ .github/
│  ├─ ISSUE_TEMPLATE/
│  │  ├─ bug_report.yml
│  │  ├─ feature_request.yml
│  │  └─ config.yml
│  ├─ workflows/
│  │  ├─ ci.yml
│  │  └─ release.yml
│  ├─ PULL_REQUEST_TEMPLATE.md
│  ├─ CODEOWNERS
│  └─ dependabot.yml
├─ packages/
│  ├─ core/
│  │  ├─ src/index.ts
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  └─ tsup.config.ts
│  ├─ cli/
│  │  ├─ src/
│  │  │  ├─ index.ts                 # #!/usr/bin/env node — bin entry
│  │  │  ├─ program.ts               # builds the commander program
│  │  │  ├─ commands/
│  │  │  │  ├─ init.ts               # placeholder handler
│  │  │  │  ├─ analyze.ts            # placeholder handler
│  │  │  │  ├─ doctor.ts             # placeholder handler
│  │  │  │  └─ explain.ts            # placeholder handler
│  │  │  └─ util/exit-codes.ts       # documented exit codes
│  │  ├─ test/program.test.ts        # asserts --help / --version / placeholders
│  │  ├─ package.json                # "bin": { "testpilot": "./dist/index.js" }
│  │  ├─ tsconfig.json
│  │  └─ tsup.config.ts
│  ├─ locator-intelligence/          # reserved stub (src/index.ts, package.json, tsconfig.json, tsup.config.ts)
│  ├─ scaffold/                      # reserved stub
│  ├─ templates/                     # reserved stub
│  ├─ ai/                            # reserved stub
│  └─ reporters/                     # reserved stub
├─ docs/                             # (existing discovery docs + this plan)
├─ .editorconfig
├─ .gitignore
├─ .npmrc                            # auto-install-peers, etc.
├─ .nvmrc                            # 20
├─ biome.json
├─ package.json                      # root, private, workspace scripts
├─ pnpm-workspace.yaml
├─ tsconfig.base.json                # shared compiler options
├─ tsconfig.json                     # solution file (project references)
├─ vitest.config.ts
├─ CONTRIBUTING.md
├─ CODE_OF_CONDUCT.md
├─ SECURITY.md
├─ LICENSE
└─ README.md                         # (existing)
```

---

## 6. Step-by-Step Commands

> Run from the repo root (`/Users/faisalislam/Downloads/testpilot-qa`). Commands shown for review;
> nothing runs until approved.

### 6.1 Initialize repo & workspace
```bash
git init
corepack enable                       # provides pnpm
echo "20" > .nvmrc

# Root manifest + workspace
pnpm init                             # then edit package.json per §7.1
printf 'packages:\n  - "packages/*"\n' > pnpm-workspace.yaml
```

### 6.2 Root dev dependencies
```bash
pnpm add -Dw typescript tsup vitest @vitest/coverage-v8 \
  @biomejs/biome @changesets/cli husky lint-staged rimraf
```

### 6.3 TypeScript & tooling config
```bash
# tsconfig.base.json, tsconfig.json (solution), biome.json, vitest.config.ts,
# .editorconfig, .gitignore, .npmrc  — created per §7
pnpm exec tsc --version               # sanity
pnpm exec biome --version
```

### 6.4 Create packages
```bash
for p in core cli locator-intelligence scaffold templates ai reporters; do
  mkdir -p "packages/$p/src"
done
# Add package.json / tsconfig.json / tsup.config.ts / src/index.ts per §7.
# cli additionally gets src/program.ts, src/commands/*, src/util/exit-codes.ts, test/.
```

### 6.5 Wire the CLI dependency
```bash
pnpm --filter @testpilot/cli add @testpilot/core@workspace:*
pnpm --filter @testpilot/cli add commander
```

### 6.6 Git hooks & changesets
```bash
pnpm exec husky init
# .husky/pre-commit -> "pnpm lint-staged"
pnpm exec changeset init
```

### 6.7 GitHub standards
```bash
mkdir -p .github/ISSUE_TEMPLATE .github/workflows
# Create LICENSE, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md,
# .github/CODEOWNERS, PULL_REQUEST_TEMPLATE.md, dependabot.yml,
# ISSUE_TEMPLATE/*, workflows/ci.yml, workflows/release.yml  — per §7.
```

### 6.8 Verify (Definition of Done)
```bash
pnpm install
pnpm build         # tsup across all packages
pnpm typecheck     # tsc --build
pnpm lint          # biome check
pnpm test          # vitest run
node packages/cli/dist/index.js --version
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js analyze     # prints "not yet implemented", exits 64
```

---

## 7. Key File Specifications (foundation — not feature code)

### 7.1 Root `package.json`
```jsonc
{
  "name": "testpilot-qa-monorepo",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "packageManager": "pnpm@9",
  "scripts": {
    "build": "pnpm -r build",
    "typecheck": "tsc --build",
    "test": "vitest run",
    "lint": "biome check .",
    "format": "biome format --write .",
    "clean": "pnpm -r exec rimraf dist && rimraf tsconfig.tsbuildinfo",
    "release": "changeset publish"
  }
}
```

### 7.2 `tsconfig.base.json`
```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

### 7.3 `packages/core/package.json` (leaf)
```jsonc
{
  "name": "@testpilot/core",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": { "build": "tsup src/index.ts --format esm --dts --clean" },
  "files": ["dist"]
}
```

`packages/core/src/index.ts` (foundation only — version constant + a couple of shared type
*placeholders*; **no logic**):
```ts
export const VERSION = '0.0.0'
// Reserved shared types are added in their feature phases (Finding, LocatorContext, etc.).
```

### 7.4 CLI bin — `packages/cli/package.json`
```jsonc
{
  "name": "testpilot-qa",
  "version": "0.0.0",
  "type": "module",
  "bin": { "testpilot": "./dist/index.js", "tpq": "./dist/index.js" },
  "scripts": { "build": "tsup src/index.ts --format esm --clean" },
  "dependencies": { "@testpilot/core": "workspace:*", "commander": "^12" },
  "files": ["dist"]
}
```

### 7.5 CLI shell — placeholder handlers (the only "logic" in Milestone 1)
```ts
// packages/cli/src/util/exit-codes.ts
export const ExitCode = {
  OK: 0, GATE_FAILED: 1, USAGE: 2, CONFIG: 3, ENV: 4, INTERNAL: 5,
  NOT_IMPLEMENTED: 64,            // temporary, Milestone-1 only
} as const

// packages/cli/src/commands/analyze.ts  (init/doctor/explain are identical shells)
import { ExitCode } from '../util/exit-codes.js'
export function analyzeCommand(): never {
  console.error('`testpilot analyze` is not yet implemented — coming in Milestone 4.')
  process.exit(ExitCode.NOT_IMPLEMENTED)
}

// packages/cli/src/program.ts
import { Command } from 'commander'
import { VERSION } from '@testpilot/core'
import { analyzeCommand } from './commands/analyze.js'
// ...init/doctor/explain imports
export function buildProgram(): Command {
  const program = new Command('testpilot')
    .description('A developer-experience layer and project accelerator for Playwright.')
    .version(VERSION, '-v, --version')
  program.command('init').description('Scaffold a Playwright project (Milestone 3).').action(initCommand)
  program.command('analyze').description('Analyze locator quality (Milestone 4).').action(analyzeCommand)
  program.command('doctor').description('Diagnose the project (Phase 4).').action(doctorCommand)
  program.command('explain <ruleId>').description('Explain a rule (Phase 4).').action(explainCommand)
  return program
}

// packages/cli/src/index.ts
#!/usr/bin/env node
import { buildProgram } from './program.js'
buildProgram().parseAsync(process.argv)
```

### 7.6 `.github/workflows/ci.yml`
```yaml
name: CI
on: { pull_request: {}, push: { branches: [main] } }
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

### 7.7 `.github/workflows/release.yml` (configured, not yet active)
```yaml
name: Release
on: { push: { branches: [main] } }
permissions: { contents: write, id-token: write, pull-requests: write }
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm, registry-url: 'https://registry.npmjs.org' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: changesets/action@v1
        with: { publish: pnpm release }
        env: { NODE_AUTH_TOKEN: '${{ secrets.NPM_TOKEN }}', NPM_CONFIG_PROVENANCE: 'true' }
```

### 7.8 GitHub standards checklist
- `LICENSE` (MIT or Apache-2.0 per §3 decision).
- `CONTRIBUTING.md` — setup, branch/commit conventions (Conventional Commits), how to run the gate, changeset requirement.
- `CODE_OF_CONDUCT.md` — Contributor Covenant.
- `SECURITY.md` — private disclosure path (a QA tool's own supply chain is part of its credibility).
- `.github/CODEOWNERS` — maintainers as default reviewers.
- `PULL_REQUEST_TEMPLATE.md` — checklist (tests, changeset, docs).
- `ISSUE_TEMPLATE/*` — bug + feature forms aligned to the labels in `GitHub-Issues.md`.
- `dependabot.yml` — weekly npm + GitHub Actions updates.
- `.editorconfig`, `.gitignore` (node, dist, coverage, `.turbo`), `.npmrc` (`provenance` ready), `.nvmrc` (`20`).

---

## 8. Acceptance Criteria

1. Fresh clone → `pnpm install` succeeds with a committed `pnpm-lock.yaml`.
2. `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` all green locally and in CI.
3. `testpilot --version` prints the version; `testpilot --help` lists `init`, `analyze`, `doctor`, `explain`.
4. Each command prints a "not yet implemented (Milestone N)" message and exits `64`.
5. At least one Vitest test exists (asserts `--help` text + a placeholder exit code) — proves the test harness works.
6. All seven packages build; the five stubs export a placeholder and contain no logic.
7. Every GitHub standard file in §7.8 is present.
8. No feature code anywhere (no AST, no templates, no scoring, no AI generation).

---

## 9. Risks & Challenges (raised now, on purpose)

| Risk | Mitigation / recommendation |
|---|---|
| **Five empty packages** add noise before they're used. | Accept the small cost to lock boundaries; revisit at approval if you'd rather create-per-phase. |
| **Biome vs ESLint+Prettier** — picking the "wrong" one annoys contributors. | Biome chosen for simplicity; fully reversible. Confirm at approval. |
| **ESM-only** could bite a future programmatic CJS consumer. | A CLI has none; tsup can emit CJS later for library packages if needed. |
| **tsup dts vs tsc declarations** double-emit confusion. | tsup emits `.d.ts`; `tsc` is `noEmit` (typecheck only). One source of truth. |
| **Over-tooling early** (Turborepo, commitlint, semantic-release). | Deliberately deferred. pnpm scripts + Changesets are enough until proven otherwise. |
| **`testpilot-qa` npm name availability.** | Verify the name is free before first publish (not in Milestone 1, but check now). |

---

## 10. What Happens After Approval

On approval I will execute §6 exactly, create the files in §7, run the §8 verification, and report
results (build/lint/test output). I will **not** start Milestone 2 (`init` scaffolding) or any
feature work until you approve Milestone 1's result.
