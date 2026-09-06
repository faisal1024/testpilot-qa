# TestPilot QA — Post-Alpha Plan: from "published" to "worth keeping in CI"

> Status: **Active plan, 2026-09-05** (Phase 9's first PR, #71, is merged; nothing from it is
> published yet). Supersedes the "post-alpha hardening = dependency majors"
> framing in [Adoption-Plan.md](Adoption-Plan.md) and [Release-Checklist.md](Release-Checklist.md).
> Those documents remain the record of how the alpha was built; this one says what happens next
> and why.

---

## 1. Where we actually are

`testpilot-qa@0.1.0-alpha.0` is on npm. Every milestone in the original plan (5C → 8A) shipped:
scaffold, six static rules, a 0–100 score with `--min-score`, brownfield baseline, SARIF + GitHub
Action, HTML report, `explain`, `doctor`, `add ai`, and a dry-run `fix`. The engineering underneath is
sound. The question the user asked — *is it usable and beneficial for people?* — needed evidence, not
another feature, so the published alpha was run against five real open-source Playwright suites.

### 1.1 Evidence: the published alpha on real suites

Corpus: cal.com (48k★, `*.e2e.ts`), immich (113k★, `*.e2e-spec.ts`), Ghost (55k★), documenso (15k★),
mattermost (39k★). 1,045 TypeScript/TSX files, blobless clones, the CLI invoked exactly as the README
shows (`npx testpilot-qa@alpha analyze <testdir>`).

| Repo | Spec files | Files analyzed (default) | Score (default) | Files (explicit glob) | Score (explicit glob) |
|---|---:|---:|---|---:|---|
| cal.com | 53 | **0** | **100 A** | 77 | 71 C |
| immich | 49 | **0** | **100 A** | 72 | 88 B |
| Ghost | 93 | 93 | 94 A | 249 | 92 A |
| documenso | 127 | 127 | 89 B | 139 | 89 B |
| mattermost | 298 | 298 | 66 D | 508 | 70 C |

**What works, verified:** zero parse errors on 1,045 real files (modern TS: `accessor`, `using`,
`satisfies`, `static {}`, TSX); 1.8 s for 508 files, 2.35 s cold via `npx`; `--min-score` exit codes
correct; baseline record → detect one new finding → exit 1 works; SARIF is well-formed with
fingerprints; `node_modules` excluded; `explain` output is better than most linters'.

**What is broken, ranked by damage:**

1. **Silent false green.** `analyze <dir>` matched zero files on two of five repos and printed
   `100 (A)`, exit 0, `warnings: []`. A typo'd CI glob does the same. Wired into CI, the gate is
   decorative. *(Fixed in PR #71 — see §3, Phase 9.)*
2. **`prefer-user-facing-locator` is a syntax ban, not a quality signal.** It fires on every
   `.locator()` call whose selector is CSS or text — including `[data-testid="x"]` (574 findings,
   identical to `getByTestId`), `[role=…]`, `[aria-label=…]`, `text=…`, and `.locator()` chained off a
   `getByRole()` parent. It is 65% of all 3,812 findings in the corpus (2,481) and roughly half of it is wrong.
3. **The score is not gate-worthy.** Ten `page.locator('[data-testid=…]')` calls score 60 D; the same
   ten as `getByTestId()` score 100 A. One call site can produce two findings (5 + 2 = 7 against a
   per-site max of 5) and clamp a file to **0 F on a single line** (reproduced locally). Flipping one
   rule to `off` moves cal.com from C to A. Accessibility and Maintainability sub-scores were
   **100 A in all five repos** — they carry no information.
4. **Page-object suites are a blind spot.** 95% of Ghost's real findings live in `e2e/helpers/pages/`,
   which the default include never opens. Same shape in mattermost (25%), immich (20%), cal.com
   (12%). POMs are also where a raw locator *should* live, and the tool can't tell.
5. **`no-css-class-selector` regex-matches any `.`**: `#AccessControlSettings\.Enable…` (escaped id),
   `input[name="meta.subject"]` (attribute value), `p[data-testid="…@cal.com"]` all reported as
   class selectors at **error** severity (39 findings). `no-deep-css-chain` counts combinators across
   comma-separated lists (`'strong em, em strong'` flagged). `no-nth-child` fires on `.nth(1)` at
   error but not `.first()`/`.last()`.
6. **Interpolated selectors are invisible but still counted.** Any `${}` in a selector makes the call
   invisible to all six rules yet it stays in the score denominator, so templating selectors *raises*
   the grade (273 such call sites in the corpus).
7. `fix` changed 8 files / 41 lines across all five repos. It only rewrites `locator('text=X')`. It
   does not do the single most mechanical rewrite available — `locator('[data-testid="x"]')` →
   `getByTestId('x')` — which would erase 574 of the tool's own findings.

Smaller confirmed UX issues: `doctor` locates `playwright.config.ts` but never reads its `testDir`
(and, before #71, checked a different directory than `analyze` used); `doctor` on a third-party repo
complains about missing `CLAUDE.md`/`AGENTS.md` (noise on a repo you don't own); `analyze --help`
doesn't list the global `--json`.

### 1.2 Evidence: adoption readiness (repo/docs audit)

- Every rule's `docsUrl` pointed at `testpilot.dev`, a domain we don't own — in the CLI, SARIF
  `helpUri`, and the HTML report. *(Fixed in #71: generated `docs/rules/<id>.md`.)*
- `examples/fragile-suite` exists but the README never shows what the tool *says* about it.
- No "why not `eslint-plugin-playwright`?" answer. That plugin (5.2M weekly downloads) already
  covers `no-wait-for-timeout` (our best rule), `prefer-native-locators`, and partly `no-xpath`.
  Our honest differentiators are: suite-level score/trend, brownfield baseline gate, SARIF + Action,
  HTML report, `explain`, mechanical `fix`, agent guidance — and eventually DOM-aware validation.
- No repo topics, no Discussions, no SECURITY contact, no config reference doc.
- **Running a subset of tests means hand-writing a `--grep` regex.** The scaffold's only selection
  is by directory (`test:e2e:ui`, `test:e2e:api`); `testpilot run` forwards flags verbatim; nothing
  generated carries a tag. Tags are Playwright's own first-class mechanism (`{ tag: '@smoke' }`,
  Playwright ≥ 1.42) and the toolkit ignores them entirely.

### 1.3 The original plan, judged

The thesis in [Adoption-Plan.md](Adoption-Plan.md) was right and still is: *local, deterministic,
explainable checks; earn trust before magic; brownfield and CI before templates.* The sequence was
executed faithfully. What it missed: every rule and the score were calibrated against an idealized
suite (`examples/fragile-suite`) rather than real ones, and "post-alpha hardening" was defined as
dependency majors — maintenance that no user will notice. **The trust the thesis wanted to earn is
exactly the gap now.** So the plan re-centres on signal quality, measured against the real-suite
corpus, and demotes dependency majors to background work.

---

## 2. Principles for what follows

1. **Evidence over intuition.** The five-repo corpus becomes a repeatable benchmark
   (`scripts/bench-corpus.mjs`, pinned commits). Every rule/score change reports before/after counts.
2. **A gate must never lie.** Zero files, uninspectable call sites, and double-counting are all
   forms of lying. Fix the mechanics before tuning weights.
3. **Precision before recall.** A rule with 27% hard false positives is worse than no rule. Split
   mechanical (auto-fixable, high precision) from judgment (info-level) rules.
4. **Be honest about ESLint.** Say what `eslint-plugin-playwright` already does and recommend it;
   compete on the suite-level workflow, not on `waitForTimeout`.
5. **No magic yet.** DOM-aware analysis stays behind the trust gate; it is the differentiator and it
   must be accurate when it lands.

---

## 3. The plan

Each phase is one or more PRs, each with the full local gate, two independent reviews (Codex-style +
Architect/SDET), P1/P2 fixed before merge, and a changeset. **Progress is tracked in this file**: a
sub-item is marked ✅ with its PR number as it merges, and a phase heading gains **— complete** when
all of its items are done.

**Release cadence.** `alpha.1` ships **now**, from #71 alone: the package on npm today (`alpha` and
`latest` both) still reports `100 (A)` on suites it never opened, and every day that stays live a
new user can wire a decorative gate into CI. After that, one alpha per phase — `alpha.2` (rest of
Phase 9 + Phase 10), `alpha.3` (11), `alpha.4` (12), `alpha.5` (13) — each with user-facing release
notes. A
beta is discussed only once the §4 targets are met on the corpus.

What a user gets at each step: after **9**, the tool finds their suite and never lies about an empty
run; after **10**, they run a smoke subset with one flag instead of a regex; after **11**, the
findings list is worth reading top to bottom; after **12**, the number is worth gating on; after
**13**, `fix --write` removes a meaningful share of what was found.

### Phase 9 — Trust the gate — **complete** (`alpha.1` now, `alpha.2` for the rest)

Goal: **`analyze` can never report a score for files it did not open — and it finds the suite.**

- ✅ **#71** — fail (exit 2/3) on zero matched files (`--json`/SARIF still emitted first, so
  agents and `upload-sarif` have something to read); default include
  `**/*.{spec,test,e2e,e2e-spec}.{ts,tsx,js,jsx,mjs,cjs}` plus a default `exclude` for build output;
  `testDir` relative to the config file for `analyze`, `fix`, and `doctor` alike; report `rootDir`
  with SARIF URIs kept `--cwd`-relative; schema 1.4 `no-files-matched`; real generated rule docs;
  `engines`.
- ✅ **9b — Playwright-aware discovery (#73).** With no `testpilot.config.ts` (or one that omits
  `testDir`), discovery reads `testDir`/`testMatch`/`testIgnore` from `playwright.config.*` —
  **parsed, never executed**, so `analyze` stays static and offline and cannot be derailed by another
  repo's config. Covers the shapes real suites use: `projects[]` (each entry its own scope, so one
  project's `testIgnore` can't delete another's files), RegExp matchers with flags applied to absolute
  paths as Playwright applies them, `defineConfig(a, b)` merged per key, CommonJS configs, and a
  config kept in a sub-directory. Anything not statically knowable is **reported**, never guessed —
  in the report's `warnings[]`, so it reaches the table, HTML, and SARIF, not just stderr. Report
  schema 1.6 adds `discovery` (per-setting provenance + the roots actually scanned).
  **Corpus target met:** cal.com and immich analyze with no flags.

  *Seven review rounds. Every round found the same failure class in a new disguise — a config we only
  partly understood producing a confident grade over part of the suite. That is worse than the total
  miss #71 fixed, because `filesAnalyzed > 0` means the zero-file guard never fires. The lasting
  lessons: the reader must say "I don't know" rather than guess, a partial read must widen rather than
  narrow, and disclosure has to live in the report — stderr is exactly what `--quiet` drops and what
  shared artifacts never carry.*
- ✅ **9c — Helper/POM discovery, opt-in (#76).** `analyze --with-helpers` / `fix --with-helpers`, or
  an `includeHelpers` list. Findings carry `inHelper` and are marked in the table, HTML and SARIF.
  A candidate must *use Playwright* to qualify — a directory name is a hint, not evidence, and
  without that gate `fix --write` reached seven Next.js route files on cal.com. `getBy*`/`.nth(` count
  only when Testing Library isn't claiming them: an RTL helper adds call sites without findings, which
  moved a failing `--min-score` to passing. Helpers never rescue a run that found no tests.
  **Ghost: 2 findings / 98 A → 116 findings, 114 of them in page objects.** Default-on is a Phase 11
  decision, once the noisiest rule is fixed.
- ✅ **9d — `doctor` stops being noisy on repos you don't own (#73).** It uses the same discovery as
  `analyze` (same config lookup, same roots, same `--no-playwright-discovery`), names where `testDir`
  came from, and skips the AI-guidance checks unless a `testpilot.config.ts` exists or
  `--strict-guidance` is passed. Doctor schema 1.1. **Follow-up:** `doctor` verifies that the resolved
  roots *exist*, not that they contain matching files, so an empty test directory passes `doctor` and
  still exits `3` under `analyze`.
- ✅ **9f — Honesty stopgaps (#77).** A README "Known limitations" section naming the over-firing
  rule, the score's non-comparability, the two dead sub-scores, and the `eslint-plugin-playwright`
  overlap. `analyze --help` now lists the global flags. False-positive and bug issue templates, both
  requiring the snippet, because Phase 11 calibrates against real reports.

  And the disclosure the reviews kept asking for: **`analyze` says when a page-object layer exists and
  was not analyzed** (`helpers-not-analyzed`). Ghost's `98 A` now arrives with "73 page object/fixture
  file(s) use Playwright but were not analyzed". The number was never wrong; it was about the wrong
  files, silently.
- ✅ **9e — Corpus benchmark (#75).** `pnpm bench` runs the built CLI against pinned commits of the
  five repos (blobless sparse clones, cached) and diffs files/findings-by-rule/score/warnings against
  `bench/baseline.json`. The gate is the **evidence that analysis happened** — files opened, locator
  call sites extracted, parse errors, discovery source — not the findings count. `findings` is the sum
  of the per-rule counts, so it always moves when a rule changes, which makes it useless for telling a
  precision fix from a broken rule. Weekly in CI and on demand; not on the PR path.

  Recorded baseline: cal.com 61 files / 1326 call-sites / 833 findings / 68 D · immich 21 / 352 / 76 /
  89 B · Ghost 94 / 95 / 2 / 98 A · documenso 127 / 3774 / 619 / 89 B · mattermost 298 / 2954 / 1544 /
  66 D. Discovery finds the files Playwright *runs*, not every file present.

  Ghost is the standing argument for 9c: 94 files but only **95 call sites**, because its locators
  live in page objects under `e2e/helpers` that Playwright's `testMatch` never runs. Its 98 A measures
  what Playwright executes, not the suite's locator quality.

### Phase 10 — Run tests by tag (`alpha.2`)

Goal: **selecting tests is a first-class, discoverable verb — not a regex.** Everything here compiles
down to Playwright's own flags, so generated projects stay ejectable and `run` stays a pass-through,
not a runner.

- **10a — `testpilot run --tag`.** `--tag smoke` runs tests tagged `@smoke`; `--tag smoke,regression`
  is any-of; `--tag '!slow'` (or `--exclude-tag slow`) excludes. Translates to a correctly escaped,
  word-bounded `--grep` / `--grep-invert` pair — the escaping and the two-flag negation are exactly
  what people get wrong by hand. Repeatable; composes with everything after `--`.
- **10b — Named tag sets in `testpilot.config.ts`.** `suites: { smoke: ['smoke'], nightly:
  ['regression', '!flaky'] }` → `testpilot run --suite nightly`. `doctor` validates that every
  referenced tag exists in the suite (see 10c), so a typo fails loudly instead of silently running
  zero tests — the same principle as Phase 9.
- **10c — `testpilot tags`.** Statically lists the tag vocabulary with counts per tag and untagged
  test count, from the parser we already have (`test('…', { tag: [...] })` and `@tag` in titles). No
  browser, instant. This is the discoverability piece `--grep` can never offer.
- **10d — Scaffold and guidance follow.** Generated sample tests carry `@smoke` / `@regression`;
  generated scripts gain `test:e2e:smoke`; the generated README explains the vocabulary; the AI
  guidance files tell agents to tag new tests from the project's existing vocabulary (agents
  otherwise invent their own).
- **10e — Optional rule `require-test-tag`** (`off` by default; `info` when enabled): flags untagged
  `test()`s so a team adopting tags can gate on coverage of the vocabulary. Static, cheap, and it
  gives `analyze` its first rule about test *organization* rather than locators.
- Docs: `run` in CLI-Spec §3, README "Run a subset", `docs/Configuration.md` `suites` key.
- Done when: a scaffolded project runs `testpilot run --tag smoke` and `--suite nightly` with no
  hand-written regex; `testpilot tags` on the corpus lists real vocabularies (mattermost and cal.com
  already use `@tag` titles) and the untagged count.

### Phase 11 — Signal precision (`alpha.3`)

Goal: **every finding at `warn`/`error` is one an engineer would act on.** Corpus target: hard
false-positive rate < 5% per rule.

- **11a — Selector tokenizer.** Replace regex scans with a one-pass CSS selector tokenizer
  (`packages/locator-intelligence/src/selector/`): selector lists, compound selectors, attribute values
  (quoted/unquoted), escapes, pseudo-classes, and the static prefix of template literals. Everything
  below builds on it.
- **11b — `prefer-user-facing-locator` becomes selector-aware, then splits:**
  - `prefer-get-by-test-id` (**warn**, auto-fixable): `locator('[data-testid="x"]')`,
    `locator('[data-test-id=…]')`, configurable attribute list matching Playwright's `testIdAttribute`.
  - `prefer-semantic-locator` (**info**): raw tag/class/`#id`/`text=` selectors with no semantic
    handle. Never fires on `[role=]`, `[aria-*]`, `has:`/`hasText:` composition, or calls chained off
    a `getBy*()` parent.
  - The old id stays as a deprecated alias in config (maps to both) with a `doctor` warning.
- **11c — `no-css-class-selector`**: fires only on a real class token in the selector (tokenizer);
  never on `#id`, attribute values, or escaped dots. `#id` selectors are not this rule's business.
- **11d — `no-deep-css-chain`**: depth per selector in a list; threshold documented and configurable.
- **11e — `no-nth-child`**: treat `.first()`/`.last()`/`.nth(n)` consistently; default severity
  **warn** (positional access over an intentionally repeated element is idiomatic); `:nth-child()` in
  CSS stays **error**.
- **11f — `no-xpath`**: the `locator('..')` parent-traversal idiom becomes a separate **info**
  finding (`avoid-parent-traversal`), so real hand-written XPath stands out.
- **11g — Uninspectable call sites** (template literals with `${}`, `as string`, variables): count
  them in a new `summary.uninspectedCallSites`, surface a `warn`-level note when they exceed 10% of
  call sites, and **exclude them from the score denominator** (Phase 12 lands the denominator
  change; 11g adds the counting). Guard the other direction too: a suite with **zero inspected**
  call sites gets no score (`null`, reported as "not enough evidence"), never `100 (A)` — the same
  rule as zero files.
- Every rule page in `docs/rules/` gains a "Does not fire on" section (generated from a new
  `notFlagged` example list in `explanations.ts`, so the docs and the tests share fixtures).

### Phase 12 — A score you can gate on (`alpha.4`)

Goal: **the number means "share of inspected locator call sites with an actionable problem", and
nothing else.**

- One call site is penalized **once**, at its highest severity (no more 0 F from a single line).
- Denominator = inspected call sites only (11g).
- **Remove** the Accessibility and Maintainability sub-scores until a rule actually feeds them;
  keep Resilience and Flakiness. Print finding counts first, the grade second.
- Report schema **2.0** (breaking: sub-score shape); `docs/Scoring.md` rewritten from the corpus with
  the five real suites as worked examples; `--min-score` docs say plainly that thresholds set on
  alpha.0–.3 must be re-chosen. **Baseline files are unaffected** — their identity is the findings,
  not the score — so the brownfield gate keeps working across this change.
- Corpus target: identical selectors written as `locator('[data-testid]')` vs `getByTestId()`
  score within 5 points; no single-line file scores below 50.

### Phase 13 — `fix` that earns its place (`alpha.5`)

- `locator('[data-testid="x"]')` → `getByTestId('x')` (respecting a configured `testIdAttribute`),
  plus `[data-test-id]`/`[data-test]` variants when configured, including the chained form
  `root.locator('[data-testid="x"]')` → `root.getByTestId('x')` so scoping is preserved. Provably
  behavior-preserving; would have rewritten 574 corpus findings vs 41 lines today.
- `locator('text=X')` → `getByText('X')` stays; add `locator('role=button[name="Save"]')` →
  `getByRole('button', { name: 'Save' })` for the simple, unambiguous cases only.
- `fix --report` emits the same JSON shape as `analyze` so the Action can post "N findings are
  auto-fixable" in the PR summary.
- Everything else stays out until DOM context exists (unchanged policy).

### Phase 14 — Front door and positioning (docs-only, parallel with 11–13)

- README rewrite around the real value: run on `examples/fragile-suite` and **show the actual
  output** (table + score + one `explain`), then the CI/baseline flow, then `fix`.
- "**Why not just `eslint-plugin-playwright`?**" section: recommend it, list the overlap honestly,
  then the suite-level workflow it doesn't do. Same section on the npm page.
- `docs/Configuration.md` (every key, defaults, Playwright-config fallback, examples for monorepos
  and POM suites) — the audit found no config reference at all.
- Repo hygiene (owner-side settings): topics (`playwright`, `testing`, `static-analysis`, `sarif`,
  `developer-tools`) and `SECURITY.md` with a contact. (Issue templates and Discussions moved to 9f.)
- Release notes per alpha written for users ("what changed in your report and why"), not for us.

### Phase 15 — Later, still behind the trust gate

- **DOM-aware validation** (ingest Playwright traces / DOM snapshots; verify a suggested
  `getByRole` is unique). This remains the differentiator and the original plan's step 8; it starts
  only after Phase 12's corpus targets are met.
- `--changed` mode for PR workflows (git diff → files), cheap once discovery is trustworthy.
- Dependency majors (#41 → #66 Biome 2 → #63 zod 4 → Node 22/pnpm 10 → #62 → #57): background
  work, one per PR, never on a phase branch, never ahead of user-visible fixes.

---

## 4. How we will know it worked

Measured on the pinned corpus by `pnpm bench` after each phase:

| Metric | alpha.0 (today) | Target after Phase 12 |
|---|---|---|
| Repos where default discovery finds the suite | 3 / 5 (alpha.0) — #71 should make it 5 / 5; bench confirms | 5 / 5 |
| Hard false positives, `prefer-user-facing-locator` (or successors) | ~27% | < 5% |
| Hard false positives, `no-css-class-selector` | ~7% | < 2% |
| Same selectors, `locator('[data-testid]')` vs `getByTestId()` score gap | 40 pts | ≤ 5 pts |
| Single-line file minimum score | 0 F | ≥ 50 |
| Sub-scores that are 100 A on every repo | 2 of 4 | 0 |
| Findings `fix --write` removes on the corpus | 41 lines | ≥ 500 |
| Runtime, 508 files | 1.8 s | ≤ 2.5 s (no regression) |
| Run a tagged subset from a scaffolded project | hand-written `--grep` regex | one flag (`--tag` / `--suite`) |

Qualitative gate before calling it beta: a maintainer of one of the five corpus repos can run the
tool with no flags, read the top ten findings, and agree with at least eight of them.

---

## 5. Decisions needed from the project owner

1. **Score semantics change in alpha (Phase 12).** It is breaking for anyone who set `--min-score`
   against alpha.0 numbers. Recommendation: do it now, while the alpha banner is up; it gets more
   expensive every week.
2. **Rule split (11b)** renames the most-fired rule. Recommendation: keep the old id as a deprecated
   alias for two releases.
3. **Helper/POM discovery default (9c → 11).** Recommendation: opt-in until Phase 11 precision lands,
   then default-on with `inHelper` grouping.
4. **Repo settings** (topics, Discussions, SECURITY contact) are owner-side; the docs/templates PR
   will list exactly what to click.
5. **npm trusted publishing** on the package page + revoking the bypass-2FA token remain owner-side
   tasks from the release work; nothing in this plan depends on them, but they should not wait.
6. **Cut `alpha.1` now from #71**, before 9b–9e land? Recommendation: yes — the live package has
   the false-green bug, and #71 is reviewed, gated, and merged. Publishing is a CI run you trigger;
   nothing here auto-publishes.
7. **Stopgap for the noisiest rule.** Until 11b, should `prefer-user-facing-locator` default to
   `info` (weight 0.5 instead of 2)? It is one line, ships in `alpha.1`, and moves cal.com from C to
   B on identical code — which is *more* honest, not less, given half of those findings are wrong.
   Recommendation: yes, with the README stating why; the proper fix is still 11b.
