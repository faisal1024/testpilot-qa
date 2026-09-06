# testpilot-qa

## 0.1.0-alpha.2

### Patch Changes

- 2359e45: `prefer-get-by-test-id` stops naming rewrites that select a different element, and learns what
  `getByTestId()` actually queries.

  **An ancestor before the test id was silently dropped**, on both the "use it directly" and the
  "scope with it" paths. `locator('#login-modal [data-testid="save"]')`
  was answered _"Use `getByTestId('save')` instead"_ — which searches the whole document. The identical
  locator written `'#login-modal >> [data-testid="save"]'` correctly abstained, so the two spellings of
  one selector gave opposite answers. A leading combinator (`'> [data-testid=x]'`) and a same-compound
  ancestor (`'.modal button[data-testid=x]'`, whose message claimed the conditions were on the _same
  element_) had the same hole. **All nine of immich's findings in the corpus benchmark were this**;
  they are now `prefer-semantic-locator` `info` rather than a wrong `warn`.

  **`getByTestId()` queries exactly one attribute** — `use.testIdAttribute` from your Playwright
  config, which defaults to `data-testid`. Suggesting it for `[data-test="x"]` or `[data-test-id="x"]`
  on a stock config named a locator that selects nothing. TestPilot now **reads `use.testIdAttribute`**
  (config and `projects[]`, found by the same lookup discovery uses — one level down included, since
  two of the five corpus repos keep their config there — resolving each project against the config it
  inherits from, and treating a spread, a non-literal value, several candidate configs, or projects
  that disagree as unknown) and qualifies the
  suggestion when the selector's attribute is not the one Playwright will query. New report field
  `discovery.playwrightTestIdAttribute` — analysis schema **1.12**.

  Worth knowing when reading the benchmark: that field resolves to `"unresolved"` on **four of the
  five corpus repos** and `null` on the fifth, because the `...devices[…]` spread idiom hides `use`
  from a static read. The feature is therefore conservative everywhere it is measured and reads a real
  declared attribute on none of its own corpus — the counts behind it come from unit tests, not from
  the corpus.

  **An unreadable options bag read as no options.** `locator('[data-testid=row]', OPTS)`,
  `{ ...OPTS }` and `{ [KEY]: 'x' }` all got the confident rewrite, because "passed but unreadable"
  and "not passed" both arrived as `undefined`. They are now distinguished, and the rule abstains on
  both. (A chained `.filter({ hasText })` still reports — it survives the rewrite.)

  **Escapes in quoted attribute values are resolved.** `[data-testid="\41 bc"]` read as the value
  `41 bc` while the identical unquoted `[data-testid=\41 bc]` read as `Abc`; both are `Abc` per CSS.
  The quoted reader copied the character after the backslash while its own doc comment said it
  resolved escapes.

  `prefer-get-by-test-id` also stops calling a test id an "ancestor" across an `xpath=..` hop
  (`'[data-testid=x] >> .. >> div'` targets an element under x's _parent_). The rewrite there would
  hold; the sentence would not, and the sentence is what this rule sells.

  Corpus totals are unchanged (1973 → 1676 findings); the split moves — `prefer-get-by-test-id`
  511 → 502, `prefer-semantic-locator` 1165 → 1174. One published count is also corrected: the
  `has`/`hasText` row of the Phase 11b attribution is **253**, not 252.

## 0.1.0-alpha.1

### Minor Changes

- 161ec18: Post-alpha fix: a run that analyzes **zero files is no longer a silent pass**.

  - **Breaking (CLI behaviour):** `analyze` and `fix` now fail when no test files match — exit `2` for
    explicit patterns, exit `3` for config-driven discovery — with a message that says what was
    searched and how to fix it. Previously a JavaScript suite (or a wrong `testDir`) scored
    `100 (A)` over 0 call-sites and passed `--min-score`.
  - **Default `include` now covers JavaScript suites:** `**/*.{spec,test,e2e,e2e-spec}.{ts,tsx,js,jsx,mjs,cjs}` (was `*.spec.ts`/`*.test.ts` only —
    cal.com's `*.e2e.ts` and immich's `*.e2e-spec.ts` suites matched nothing). Explicit `include` values in your config are unchanged.
  - **Default `exclude`** (new config key): `node_modules`, `dist`, `build`, `coverage`, `test-results`,
    `playwright-report` — so a compiled copy of a TypeScript suite is not analyzed twice now that `.js`
    is in the default include. It applies wherever `include` chose the files (config-driven discovery and
    directory arguments); a glob or path you name explicitly is still honored, so
    `analyze dist/e2e/a.spec.js` works. Setting `exclude` replaces the defaults.
  - **Monorepo-friendly discovery — behaviour change:** `testDir` resolves relative to the directory of
    the loaded `testpilot.config.ts` — or, with no config file, the project root (nearest `package.json`)
    — rather than the current working directory, for `analyze`, `fix`, and `doctor` alike, so `doctor`
    always predicts what `analyze` will do; reported file paths (`findings[].file`, `fix` output, baseline identities) are
    relative to it too. Explicit CLI patterns still resolve from `--cwd`. **Migration:** if you relied
    on running from a sub-directory with a _parent_ config to analyze the sub-directory's own `tests/`,
    pass explicit patterns or a per-package `--config`; if you used `--config packages/web/testpilot.config.ts`
    with a root-relative `testDir: 'packages/web/tests'`, change it to `testDir: 'tests'`. Baselines
    recorded from a sub-directory before this release should be re-recorded.
  - **SARIF paths are unchanged:** `artifactLocation.uri` stays relative to `--cwd` (re-resolved from
    the new `rootDir`), so the GitHub Action's repo-root contract still holds.
  - **Report schema `1.4`:** adds top-level `rootDir` (absolute base of reported paths) and the
    `no-files-matched` warning code. On a zero-file run, `--json` and `--reporter sarif` output is still
    emitted (with the warning, `filesAnalyzed: 0`) before the non-zero exit, so `upload-sarif` with
    `if: always()` keeps working; the table/HTML reporters print only the error. The programmatic
    `analyze()` API warns rather than throws.
  - `--verbose` prints the resolved discovery base (`[testpilot] files: N under <dir>`); `rootDir` in the
    JSON report is always absolute.
  - **AI guidance is now v2:** the generated agent globs follow the widened default `include`, so JS and
    `*.e2e.ts` suites are covered. After upgrading, `doctor` reports your existing guidance files as
    **stale** — run `testpilot add ai` to preview and `testpilot add ai --write` to refresh them
    (hand-edited files still need `--force`).
  - **Rule docs are real now:** every `docsUrl` (CLI, SARIF `helpUri`, HTML report) points at
    `docs/rules/<rule-id>.md` in this repository instead of the unowned `testpilot.dev` domain. The
    pages are generated from the same source as `testpilot explain` (`pnpm docs:rules`).
  - `doctor` no longer describes `testpilot add ai` as unshipped; its drift remediation now names the
    command to run.
  - `testpilot-qa` declares `engines.node >= 20` so unsupported installs warn up front.

- 719536c: Run tests by tag, and see what tags exist.

  - **`testpilot run --tag <tags>`** runs tests carrying any of those tags; `--exclude-tag` (or a `!`
    prefix) excludes. Selection compiles to Playwright's own `--grep` / `--grep-invert` and the
    compiled flags are printed, so generated projects stay ejectable and `run` stays a pass-through.
    The compiled value is slash-delimited (`--grep "/…/"`) because Playwright compiles a **bare**
    `--grep` string with the `gi` flags — without the wrapper, `--tag here` would also run `@HERE`.
    Whole-tag boundaries mean `--tag smoke` does not run `@smoketest` and `--tag team` does not run
    `@team:auth`.
  - **`suites` config key + `--suite <name>`** names the sets you actually run:
    `suites: { nightly: ['regression', '!flaky'] }`. A list is any-of; the object form
    (`{ any, all, none }`) adds all-of, which a list cannot express. The list form is permanent sugar
    for `any` and will never be reinterpreted.
  - **`testpilot tags`** statically lists the tag vocabulary with per-tag test and file counts, **how
    each tag was declared** (title vs `{ tag: [...] }` — the difference between a vocabulary and
    incidental prose Playwright happens to read as a tag), the untagged count, and each configured
    suite resolved against the real vocabulary. New `--json` contract, `schemaVersion` `1.0`, with its
    own warning-code union rather than widening `AnalysisWarning`.
  - **`analyze` schema `1.7` → `1.8`:** `discovery` gains `playwrightConfigDeclaresTags`.
  - **`doctor` gains a `suites` check** (`DOCTOR_SCHEMA_VERSION` `1.2`). An empty or malformed suite
    fails; a suite referencing a tag no test carries warns. A typo in `suites` previously ran zero
    tests and exited `0`. When the vocabulary cannot be read completely the check says so rather than
    reporting every tag as a typo.
  - **Nothing silently selects the wrong set.** Usage errors (exit `2`) for: an unknown suite (lists
    the real ones), a tag both included and excluded, a malformed tag token, an **empty** flag value
    (`--tag "$UNSET_VAR"` must not run everything), more than one `--suite` (two suites cannot fold
    into one include/exclude pair without changing what either selects), and `--tag` combined with a
    forwarded grep flag (`--grep`, `-g`, `-G`, `--flag=value`, `-g@smoke`, and combined clusters such
    as `-xg`, which commander parses as `-x -g`), and `--suite` combined with `--tag` (both choose what
    to include, and neither "either" nor "both" is the obvious reading). `--exclude-tag` still composes
    with `--suite`: narrowing a suite is unambiguous.
  - **`tags` discloses its own bounds** in the report, not just on stderr: template-literal titles,
    titles built from a variable, `tag` entries it cannot read statically, files where no `test()` was
    recognized (a renamed import such as `import { test as setup }`), and tags `--tag` cannot select.
    `summary.vocabularyComplete` is the single flag `tags`, `doctor` and the suite counts all key on,
    so they cannot disagree about whether a tag exists: when it is `false`, a tag we did not find is
    reported as _unconfirmed_, never as a typo. It also covers a `test.describe` whose body is a
    function reference (its tests are declared elsewhere) and a Playwright config that declares its own
    `tag` key, which Playwright applies to every test in every file.
  - **An exclusion nobody carries is a no-op, not a mistake.** `nightly: ['regression', '!flaky']`
    before anyone has tagged `@flaky` no longer reports "would not select what you expect", and no
    longer suppresses the suite's count.
  - **Fix:** `analyze` no longer warns that a `testDir` is missing when explicit patterns were passed —
    discovery never consulted it, so the warning named the wrong directory.

  Note: adding `suites` to `testpilot.config.ts` makes the config unreadable by `0.1.0-alpha.0`, whose
  schema is `.strict()`.

- f059688: Tagged scaffold, tag guidance for AI agents, and an opt-in `require-test-tag` rule.

  - **`testpilot init` scaffolds a tagged project.** The sample tests carry `@smoke` and
    `@regression`, demonstrating both spellings Playwright accepts (a tag in the title and the
    `{ tag: [...] }` details argument); the generated `testpilot.config.ts` defines `smoke` and
    `regression` suites; `package.json` gains `test:e2e:smoke` written as **plain Playwright**, so the
    project stays ejectable; and the generated README explains why the obvious hand-written
    `--grep @smoke` is wrong. `testpilot tags` on a fresh scaffold reports 2 tags, 0 untagged.
  - **AI guidance covers tags** (`GUIDANCE_VERSION` 3 → 4, so existing projects see the drift):
    agents are told to check `testpilot tags` and reuse the project's existing vocabulary rather than
    invent one, that a `describe` tag covers the tests inside it, and that an untagged test silently
    misses every tagged run.
  - **New rule `require-test-tag`** — `off` by default, `info` when enabled — flags tests carrying no
    tag. Opt-in because a suite that never adopted tags would otherwise light up with one finding per
    test, which says nothing about quality. It does not fire on a test whose title could not be read
    statically: that title may well carry a tag, and flagging it would be an accusation based on our
    own blind spot.
    It also abstains wherever it cannot see: a title or `tag` entry that is not statically readable —
    its own **or an enclosing `test.describe`'s, title included** — a `test.describe` whose body is a
    function reference (its tests are declared elsewhere and inherit the block's tag), and any suite
    whose Playwright config declares — **or may declare** — a global `testConfig.tag`. It judges on
    **selectable** tags, so a tag fused into a word (`user@example.com`) does not count; the finding
    says exactly that ("no tag `--tag` can select"), because such a tag _is_ a Playwright tag and
    `--grep` can reach it.
  - **A one-line coverage rollup** (`warnings[].code: 'test-tag-coverage'`) replaces triaging N
    interleaved `info` lines, and reconciles against `testpilot tags` — which counts more, because it
    includes the tests this rule declines to judge.
  - **Its findings are counted but not scored.** The Locator Quality Score's denominator is locator
    call sites; a per-test rule has no relation to it (on Ghost — 95 call sites, 321 tests — scoring
    it would drop a 98 to roughly 64). A rule declares this itself via `RuleMeta.scored: false`, not
    by its kind, so a later test-level rule that _does_ belong in the score is not blocked.
    `summary.unscoredFindings` and `summary.unscoredRuleIds` report the exclusion, and it is stated in
    the table and the HTML report too — a silent adjustment to a number you gate on would be worse
    than the rule not existing. `docs/Scoring.md` documents it. **`analyze` schema `1.8` → `1.9`.**
  - Test-rule findings use a title-free snippet, so renaming an untagged test does not read as a new
    finding and fail a `--baseline` gate for a reason unrelated to tagging.
  - The rule engine gains a second rule kind (`TestRule`, over a `test()` declaration rather than a
    locator call site) — the shape any rule about test _organization_ needs. Extracting declarations
    is a second AST pass, so `analyze` only does it when such a rule is actually enabled.

- e862495: A real selector tokenizer, and `no-css-class-selector` stops guessing.

  Every rule that reasoned about selectors used a regex, and they were all wrong on the same three
  inputs — which are not exotic, they are what real suites contain:

  | selector        | the old regex      | reality                               |
  | --------------- | ------------------ | ------------------------------------- |
  | `[href=".pdf"]` | a class `.pdf`     | a dot inside a quoted attribute value |
  | `.mt-1\.5`      | two classes        | one Tailwind class                    |
  | `a, b`          | a descendant chain | a selector list                       |

  - **New `packages/locator-intelligence/src/selector/`** — a one-pass tokenizer for Playwright's
    selector syntax: CSS selector lists, compound selectors, attribute values (quoted, unquoted,
    escaped, with the `i` flag), identifier escapes, pseudo-classes with balanced nested arguments,
    and the `>>` engine-chaining operator with each part tagged by engine (`css`, `text`, `xpath`,
    `id`, `role`, `test-id`, …). Selectors are tokenized **once per call site** in the extractor and
    shared. Only `no-css-class-selector` reads the parse so far — the other five rules still use
    their own regexes, and 11b/11d/11e/11f move them across.
  - **It never guesses.** Anything it cannot parse — an unbalanced bracket, an unterminated string, a
    nested `:has()` argument that will not read — is reported in `unparsed`, and a rule that needs the
    parse abstains. "This selector has no classes" is not a safe conclusion when part of it is
    unreadable.
  - **`no-css-class-selector` now reads the parse.** Measured rule-vs-rule over the corpus:
    **29 findings removed, 0 added.** Every removal is a genuine false positive — a dot inside a
    quoted attribute value (`input[name="meta.subject"]`, `p[data-testid="…+seats@cal.com"]`, an
    escaped `#admin\.access_control\.…`). `filesAnalyzed`, `callSites` and `parseErrors` are
    unchanged, so the benchmark's evidence gate is untouched.
  - **It reads nested selectors**, so a class inside `:has()`, `:not()`, `:is()`, `:right-of()` or
    `:near()` still counts — Playwright's positional pseudo-classes take a real selector, and reading
    them as opaque text reported "no classes" with a clean parse. `:has-text()` and friends take text
    and are deliberately not parsed as selectors; an argument-bearing pseudo-class the tokenizer does
    not recognize **abstains** rather than assume either.
  - The finding now names the classes it found, so it is actionable without opening the file.
  - **Rule docs gain a "Does not fire on" section**, generated from a new `notFlagged` list — and a
    test executes every example against its own rule, so the list is a fact rather than a promise.
  - **A differential test pins the tokenizer to Playwright's own parser.** `playwright-core` is a
    **devDependency** (never bundled — the CLI's tsup config bundles only `@testpilot/*`), used purely
    as an oracle: over every statically-known selector in the corpus it asserts we never accept what
    Playwright rejects, and tracks how often we abstain where it parses. Currently **zero in both
    directions**. It runs in the `bench` job, which is the one with the corpus, gated on an explicit
    env var so it cannot skip silently — keyed only on "is the corpus present?", the whole file passed
    green while skipped, which made it no evidence at all. A hand-written parser for someone else's syntax drifts; this is what makes
    maintaining one defensible.

- 25fe129: Phase 11b + 11g — the noisiest rule splits, and the report says what it could not read.

  **`prefer-user-facing-locator` is replaced by two rules.** It was 65% of every finding TestPilot
  reported on a five-repo corpus, at `warn`, whether the selector was `[data-testid="save"]` (a
  mechanical rewrite) or `#login-form div.actions > button` (a judgement call).

  - **`prefer-get-by-test-id`** (`warn`, 511 corpus findings) — a test id addressed through a raw CSS
    attribute selector. What it says depends on where the test id sits, because the three cases do not
    have the same fix: on the target alone → `Use getByTestId('save')` (426); on an ancestor →
    `Scope with getByTestId('list')` and chain the rest (29); on the target **alongside other
    conditions** → use `getByTestId()` for the test id and say plainly that the rest constrains the
    same element and cannot become a chained `locator()`, which would search inside it (46). It also
    covers Playwright's own `data-testid=` selector engine (10). The attribute list defaults to
    `data-testid`, `data-test-id`, `data-test` and is configurable:
    `ruleOptions: { 'prefer-get-by-test-id': { testIdAttributes: ['data-qa'] } }` — read by **both**
    new rules, so a configured list cannot make one of them fire twice and the other not at all.
    It stays silent where `getByTestId()` has no equivalent: a bare `[data-testid]` presence check, a
    test id inside `:not()`/`:has()` (where it names an element the selector excludes, or a
    descendant), a selector list (more than one target), a test id reached through a `+`/`~` sibling
    step (`[data-testid="row"] + button` puts it on a sibling), a `>>` part _preceding_ the test id
    (`#modal >> [data-testid=x]` — an ancestor scope `getByTestId()` would drop), and a call whose own
    options carry a filter (`locator('[data-testid=row]', { hasText: 'Alice' })` is not
    `getByTestId('row')`, which selects every row). A chained `.filter()` still reports, because it
    survives the rewrite.
  - **`prefer-semantic-locator`** (`info`, 1165 corpus findings) — a selector with no role, label or
    ARIA handle. It stays quiet on `[role=]`/`[aria-*]`, on content composition in **either**
    spelling (`{ has, hasNot, hasText, hasNotText }`, `.filter({ hasText })`, `:has()`, `:has-text()`,
    `:text()`), on a `locator()` narrowing a `getBy*()` parent — including through
    `.filter()`/`.first()`/`.last()`/`.nth()` — and on test ids.

  **A config or baseline written against the old id keeps working**: `prefer-user-facing-locator` maps
  to both successors and carries its severity to them, with a `deprecated-rule-id` warning. It is no
  longer _also_ reported as an unknown rule — the report used to say "unknown — ignored" and "taking
  its setting" about the same line.

  Measured on the corpus: **1973 findings became 1676**. Reasons the 297 no longer fire, counted
  independently — **a call site can appear in more than one row**, so these do not partition:
  252 composed with a `has`/`hasText` option (167 of them via `.filter()`, which the rules could not
  previously see), 35 carrying `role=`/`aria-*`, 21 chained off a `getBy*()` parent, 12 composed with
  `:has()`/`:has-text()`, 0 unreadable.

  Scores rise (cal.com 74→82, immich 91→96, documenso 91→94, mattermost 67→76, Ghost 99 unchanged)
  from re-grading 1165 findings `warn`→`info` plus those removals; `callSites` is identical on all
  five repos, so the rise is not a denominator change. Note this also **downgrades** an existing
  double-report: **478** corpus call sites used to carry both a class-selector `error` and the old
  nudge, costing 7 points each; **348** still carry both (5.5, now that the nudge is `info`) and
  **130** carry only the error (5). Deduplicating what remains is Phase 12's "one call site, one
  penalty", not a rule reaching into another rule.

  **Uninspectable call sites are now counted and disclosed (11g).** A selector built with `${}`, held
  in a variable, or written as `as string` is a call site no rule can read — and it still counts
  toward the score's denominator.

  - `summary.uninspectedCallSites` counts them. On the corpus: **317 of 8501 call sites (3.7%)** —
    cal.com 40/1326, immich 20/352, Ghost 2/95, documenso 147/3774, mattermost 108/2954.
  - A run where they exceed 10% of call sites emits an `uninspected-call-sites` warning. **It fires on
    none of the five corpus repos**, so the threshold has no corpus evidence behind it — only the
    counts do.
  - When **every** call site is uninspectable, `score.score`, `score.grade` and every sub-score are
    `null`, printed as "not enough evidence" — never `100 (A)` over locators nobody read.
    `--min-score` fails on a `null` score. A partly unreadable suite still gets a number; taking those
    call sites out of the denominator is Phase 12.
  - Deliberately **not** counted: a selector the tokenizer declined to parse. Its text was read and
    the rules that do not need the parse still ran — `page.locator('//button >> ')` is reported by
    `no-xpath` — so counting it printed "not enough evidence" directly above an `error` finding.

  Analysis schema **1.11**, and the first `analyze` bump that is **not purely additive**:
  `summary.uninspectedCallSites` is added, but `score.score`/`score.grade` (headline **and** every
  sub-score) become `number | null`. A consumer written as `if (score.score < 80) fail()` passes on
  `null`. See `docs/CLI-Spec.md` for the shape and the check.

- cc10177: Three rules get more precise, and two over-graded findings are re-levelled.

  - **`no-deep-css-chain` measures depth per selector**, from the tokenizer. A comma is not a
    combinator: `strong em, em strong` is two one-step selectors, and the old string-mangling scored it 3. Depth inside `:has()` counts; a `>>` chain does not add across parts. The threshold is now
    configurable — `ruleOptions: { 'no-deep-css-chain': { maxChainDepth: 4 } }` — and the finding says
    how deep the selector actually is.
  - **`avoid-positional-access` (new, `warn`)** takes `.nth()` out of `no-nth-child`. Picking one of an
    intentionally repeated element is idiomatic Playwright and appears throughout its own docs, but it
    was graded identically to a CSS `:nth-child()` selector. Measured: **all 276** of `no-nth-child`'s
    corpus findings were `.nth()` — the CSS pseudo the rule is named for produced none of them, so the
    `error` severity was in practice grading only the idiomatic case.
    `no-nth-child` keeps `:nth-child()` at `error` and, reading the tokenizer, no longer fires on the
    pseudo's name inside an attribute _value_. It also now covers **`:nth-last-child()`**, which the
    old `:nth-child(` substring check missed — corpus-neutral, but a suite using it gains a new
    `error` finding.
  - **`avoid-parent-traversal` (new, `info`)** takes `locator('..')` out of `no-xpath`. It is a
    recognised Playwright idiom rather than a hand-written path expression — and on the corpus it was
    **9 of the 11** xpath findings, so the `error`-level rule was mostly reporting the quiet case and the
    real XPath did not stand out.
  - Both new rules ship with a **"Does not fire on"** list that the test suite executes.

  **On the score.** It rises: cal.com 69→74, immich 89→91, Ghost 98→99, documenso 89→91,
  mattermost 66→67. That is entirely the two re-gradings — cal.com is 113 findings × 3 weight points plus one
  xpath finding × 4.5, over 1326 × 5 — 5.18%. **`callSites` is unchanged on all five repos**, which is how you can tell
  the rise is not the denominator moving.

  `.first()`/`.last()` are **not** extracted yet, against the plan's wording for 11e. They would become
  call sites — the score's denominator. Measured by adding them to `LOCATOR_METHODS` and re-running the
  corpus:

  | repo       | callSites             | score       |
  | ---------- | --------------------- | ----------- |
  | cal.com    | 1326 → 1431 (+7.9%)   | 74 → 73     |
  | immich     | 352 → 366 (+4.0%)     | 91 → 90     |
  | Ghost      | 95 → 143 (**+50.5%**) | 99 → **86** |
  | documenso  | 3774 → 4054 (+7.4%)   | 91 → 89     |
  | mattermost | 2954 → 3202 (+8.4%)   | 67 → 66     |

  Ghost loses 13 points because 35% of its locator calls are positional (50 of 143). The reason to hold it back is
  not the size of the move but that it is a **second, unrelated mechanism** acting on the same number:
  a severity re-grade and a denominator change are different claims about a suite, and shipping both at
  once makes neither checkable. `callSites` is byte-identical on all five repos here precisely so a
  reader can attribute this release's movement entirely to the re-grading. The denominator is Phase
  12's subject; the rule already handles the two calls.

  **If you gate on `--min-score`, re-check your threshold on this release.** Scores rise, so a gate you
  had tuned tightly is now looser than you meant. One exception in the other direction: a suite using
  `:nth-last-child()` picks up a new `error` finding, which a tight gate could fail on.

  Two rules — `no-deep-css-chain` and `no-nth-child` — now fire on **none** of the five corpus repos,
  so they are covered by unit tests alone. That is recorded in the baseline rather than left for a
  reader to notice.

  Also folds in two follow-ups to the tokenizer: `:nth-child(2 of.foo)` with no space after `of` is
  valid CSS that Playwright accepts and was silently dropping its selector, and the differential CI
  step now runs after the corpus exists rather than before it.

  **Existing configs and baselines keep working.** A rule split changes finding ids, which would
  otherwise re-report every grandfathered finding as new (measured: 114 on cal.com, on a suite where
  nothing changed) and un-silence a rule someone had set to `off`. Both are handled by a successor map:
  a `--baseline` entry recorded under a rule's previous id still matches, and the table, `--json` and the HTML report all say how many did, so the absorption is visible rather than silent, and a severity set on the old id carries to its successors with a
  `deprecated-rule-id` warning naming the replacement.

  **Existing configs and `--baseline` files keep working; SARIF suppressions do not.** GitHub code
  scanning keys an alert on `ruleId` plus location, and the successor map is a TestPilot-side concept,
  so findings that changed id will surface as closed-and-reopened alerts on the first run after
  upgrading. There is no way to avoid that from here — flagged because it is the one place the
  compatibility work does not reach.

  `GUIDANCE_VERSION` 4 → 5, since the AI guidance told agents to "never use `.nth()`" and the analyzer
  no longer agrees.

- acc76ad: Phase 9b/9d — **TestPilot finds the suite Playwright actually runs**, and `doctor` stops reporting on
  projects that never adopted TestPilot.

  - **Playwright-config fallback.** When `testpilot.config.ts` doesn't set `testDir` (or doesn't exist),
    discovery reads `testDir`, `testMatch`, and `testIgnore` from `playwright.config.*` — including
    `.cjs`/`.js` files using `module.exports`. This covers the shapes real suites use: settings declared
    under **`projects[]`**, **`RegExp` matchers** (applied to absolute paths as Playwright applies them,
    not mistranslated into globs), and a config kept in a sub-directory such as `e2e/`. Verified against
    the cal.com and immich configurations, which previously matched zero files.
  - **Every `projects[]` entry is its own scope** — a root plus the selectors that apply to it,
    inheriting the top level. That includes projects declaring no selectors of their own, as in
    Playwright's documented `setup` pattern (`{ name: 'setup', testMatch: /.*\.setup\.ts/ }` beside
    browser projects with none): those browser projects run the whole suite, and dropping them analyzed
    the setup files alone and printed a clean score over a fraction of the tests. One project's
    `testIgnore` can no longer delete another project's files, and a project whose `testDir` is computed
    is skipped rather than silently scanned at its parent's root.
  - **An explicit `include` or `exclude` outranks Playwright's `testMatch`/`testIgnore`**, exactly as an
    explicit `testDir` does — a Playwright glob silently dropping files while every message credited
    `testpilot.config` was the worst of both.
  - **Playwright's matchers are applied the way Playwright applies them:** globs and RegExps (with their
    flags) match against the **absolute** path. TestPilot's own `include` keeps its root-relative
    meaning. A config that declares no `testDir` still contributes its own directory, which is
    Playwright's default test root.
  - **Nothing is dropped in silence.** A `projects` array built by a function or containing a spread, a
    `defineConfig(base, override)` layered on an imported base, a computed `testDir` — each is still
    used for what _was_ readable, with the base test root kept because the entries we cannot see inherit
    it, and the rest reported. Those reports now reach `warnings[]` (schema **1.6**:
    `playwright-config-partial` / `playwright-config-ignored`), so the table, the HTML report, and SARIF
    (`invocations[].toolExecutionNotifications`) all show them — not just stderr, which `--quiet`
    suppresses and shared artifacts never carried.
  - **The Playwright config is parsed, never executed.** `analyze` is advertised as static and offline
    and is routinely pointed at a repository you're only evaluating; running that repo's config could
    write to stdout (corrupting `--json`), call `process.exit` (colliding with the gate-failure exit
    code), hang, or need `@playwright/test` to be installed. Anything not statically knowable — a
    computed value, a spread from another object — is reported as such rather than guessed at.
  - **`testDir` and `testMatch` are adopted as a pair**, so a project scaffolded by `testpilot init`
    (which sets `testDir` and not `include`) keeps analyzing exactly the files it did before.
  - **Fixed: `node_modules` is now always skipped.** Setting `exclude` in `testpilot.config.ts` replaces
    the defaults, which previously removed the dependency guard — with a broad `testDir`, `analyze`
    could score dependency code and `fix --write` could rewrite it.
  - **It tells you.** When the fallback supplies a setting, `analyze`/`fix` name the directories being
    scanned on stderr; when a Playwright config is found but can't be used, the reason appears in the
    zero-file error, in a new `doctor` check, and in the report. `--no-playwright-discovery` turns the
    fallback off for `analyze`, `fix`, and `doctor` alike.
  - **`defineConfig(base, override)` is merged per key**, later layers winning, as Playwright merges
    them — and a config assembled from a layer we cannot read no longer synthesizes a test root, which
    had widened the scan to the whole project and scored files Playwright never runs. Only
    `defineConfig`/`mergeConfig` calls are unwrapped: a project-local `makeConfig({...})` can rewrite
    what it is given, so its argument is reported rather than trusted.
  - **`exclude` and `testIgnore` both apply.** They are not competing definitions of one thing — adding
    one exclusion never means "also run the suite Playwright skips" — and the provenance is reported as
    `mixed` so you can see which side dropped a file.
  - **The success path is disclosed too:** when a Playwright config supplied the test roots, the table
    and the HTML report name the directories scanned and the config they came from, so an adoption that
    is wrong-but-unflagged is visible in the artifacts a team actually reads. `fix --json` carries
    `discovery` and the same warnings — it is the write path and must be at least as loud as `analyze`.
  - **A declared test root that does not exist is reported** (`test-root-missing`), so a config naming
    two roots where one is absent can no longer score a clean grade over half of them.
  - **A zero-file run publishes an unsuccessful SARIF invocation** with the `no-files-matched`
    notification, instead of a result set indistinguishable from a clean scan.
  - **A `playwrightConfig` you set explicitly is honored**: if it points at a file that does not exist,
    discovery stops and says so rather than silently reading a different config.
  - **Report schema `1.6`:** new top-level `discovery` — per-setting provenance
    (`testpilot-config` | `playwright-config` | `default`), the `roots` actually scanned,
    `playwrightConfigPath`, and `playwrightConfigIgnored`. `rootDir` stays a pure function of repo
    layout — it anchors baseline identities, so it must not shift when a config gains a project — and a
    test root outside the project is reported with `../`, with SARIF emitting an absolute `file://` URI
    instead (code scanning rejects `..` and drops the upload).
  - **Doctor schema `1.1`:** `checks` is now variable-length. `ai-guidance` is omitted on a project
    without a `testpilot.config.ts` (running `doctor` on someone else's repo reported four missing files
    that were never theirs) — pass `--strict-guidance` to check anyway. A `playwright-discovery` check
    appears only when a Playwright config was found and could not be used. `test-directory` names the
    directories discovery actually resolved (and only the ones actually missing), gained `details`, and
    is omitted entirely when the config failed to load. A repo with several Playwright configs is told
    to pick one rather than to add one.

  **Known limitations** (documented in `docs/CLI-Spec.md`): a partial read always widens rather than
  narrows, so the score may include files Playwright does not run — always flagged
  `playwright-config-partial`; TestPilot's default `include` is a superset of Playwright's default
  `testMatch`; and `doctor` verifies that the resolved roots exist, not that they contain matching
  files, so an empty test directory passes `doctor` and still exits `3` under `analyze`.

- 2fbee55: Phase 9c — **analyze the page objects too, when you ask for them.**

  Playwright's `testMatch` selects the files it _runs_, and most suites keep their locators somewhere
  else. On the Ghost repository, `analyze` reports 94 files, 95 locator call sites and 2 findings — a
  98 (A) — because its 130 page-object and helper files, which hold 114 of its 116 findings, are not
  files Playwright runs. The grade was measuring what Playwright executes, not the suite's locator
  quality.

  `analyze --with-helpers` and `fix --with-helpers` include them; so does naming your own locations in
  `includeHelpers`, which is itself the opt-in. The defaults cover `pages`, `page-objects`,
  `pageobjects`, `pom`, `fixtures`, `helpers`, and `support`.

  - They are scanned from the **config's directory**, not from `testDir` — helpers sit beside the test
    root far more often than inside it (Ghost's are in `e2e/helpers` while its tests are in `e2e/tests`,
    so scanning from the test root finds nothing).
  - Findings carry **`inHelper: true`** and are counted in `summary.helperFiles` (schema **1.7**). "Your
    page object uses a CSS class" is a different conversation from "your test does", and folding them
    together would change what the score measures without saying so.
  - **Off by default.** A score that quietly included files Playwright never runs would not be
    comparable to one that didn't.
  - **A directory name is only a hint.** `pages/` is Next.js's and Nuxt's route directory, `helpers/` is
    Ember's — so a candidate must also contain something the analyzer would extract before it is
    analyzed. Without that gate, `fix --write` would rewrite application source; on cal.com it would have
    reached seven Next.js route files. The gate is deliberately not keyed on a receiver named `page`
    (page objects use `this._page`, `this.root`, `adminPage`), and `getBy*`/`.nth(` count as evidence
    only when nothing in the file claims them for Testing Library — an RTL helper produces no findings
    while adding call sites, which is enough to move a failing `--min-score` to passing. When helper directories match but nothing in them uses Playwright, the
    run says so rather than reporting an empty helper layer as an absent one.
  - **Helpers never rescue a failed run.** If the test scan matched nothing, the run still fails, rather
    than scoring the helper layer alone and turning a wrong `testDir` into a green gate.
  - Findings are marked `[helper]` in the table and HTML, and carry a SARIF `properties.inHelper`, so a
    code-scanning reviewer is not shown a page-object finding as an ordinary test finding.

- 9c3233a: Phase 9f — say what the score does not cover.

  - **`analyze` reports a page-object layer it did not analyze** (`helpers-not-analyzed`). Most suites
    keep most of their locators in page objects, which Playwright's `testMatch` never runs: Ghost's
    `98 (A)` is measured over 95 of its 768 locator call sites. That number was never wrong — it was
    about the wrong files, silently. It now arrives with "73 page object/fixture file(s) use Playwright
    but were not analyzed", and goes quiet once you pass `--with-helpers`.
  - **README gains a "Known limitations" section**: `prefer-user-facing-locator` over-fires (≈65% of all
    findings on a five-repo survey, roughly half of them wrong) with the config line to set it to
    `info`; the score is a trend within a repo rather than a bar between repos, and `--baseline` is the
    honest gate today; Accessibility and Maintainability sub-scores are always `100 A` because no rule
    feeds them; `no-hard-wait` overlaps `eslint-plugin-playwright`.
  - **`analyze --help`, `fix --help` and `doctor --help` list the global flags.** Commander shows a
    subcommand's own options only, so `--json` — which the README uses — appeared nowhere.
  - **Issue templates** for bugs and false positives, both requiring the snippet. Phase 11's rule work
    calibrates against real false positives, so the loop that collects them opens first.

### Patch Changes

- c17a571: Phase 9e — a corpus benchmark, so signal loss cannot ship quietly.

  `pnpm bench` runs the built CLI against pinned commits of five real open-source Playwright suites
  (cal.com, immich, Ghost, documenso, mattermost) and diffs the result against a committed baseline.

  The gate is the **evidence that the analysis happened** — files opened, locator call sites extracted,
  parse errors, discovery source, and whether the tool emitted a warning — not the findings count.
  `findings` is by construction the sum of the per-rule counts, so it always moves when a rule changes;
  "a rule row moved" says nothing about whether the change was intended. Findings and per-rule counts
  are reporting, and the reviewer reads the table.

  This is developer tooling; nothing in the published package changes. It exists because every
  discovery defect found while building Phase 9 was caught by hand, one fixture at a time, invented
  after the fact. The rule changes coming in Phase 11 will move these numbers a great deal, and the
  point is that each move has to be looked at and explained rather than absorbed.

  The gate runs on pull requests that touch the analyzer — the change that would introduce a regression
  is the one that should see it — with the pinned corpus cached, so a warm run is seconds.

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

- 14da461: Milestone 5C — public alpha hardening and package smoke.

  - **Self-contained published CLI:** `testpilot-qa` now bundles the internal `@testpilot/*` workspace
    packages and declares its real npm deps (`commander`, `zod`, `jiti`, `tinyglobby`,
    `@typescript-eslint/parser`). The packed tarball installs and runs without any unpublished
    workspace dependency. The `@testpilot/*` packages are now `private` so **only `testpilot-qa`
    publishes** (they are bundled, not shipped as separate npm packages).
  - **`pnpm smoke:package`** (`scripts/smoke-package.mjs`): packs the CLI, installs the tarball into a
    fresh temp project, and runs the installed binary (`--help`/`--version`, `explain --json`, `init`
    - AI guidance + overwrite protection, `doctor`, `analyze`). Proves the install path a consumer
      gets. Offline after the one registry install; no browsers.
  - **`analyze <dir>`**: a positional that is a directory is expanded into its test files, so
    `analyze examples/fragile-suite` works.
  - **`examples/fragile-suite/`**: a small, intentionally-fragile spec (XPath, CSS class, hard wait, +
    one good locator) with a README, used to demonstrate `analyze` output. `smoke:mvp` now asserts the
    expected rules fire on it.
  - Docs: README repositioned as an honest public alpha; `docs/Release-Checklist.md` adds
    `smoke:package` (and how it differs from `smoke:mvp`) + the dependency-PR strategy;
    `docs/Adoption-Plan.md` marks 5C active.

  Still alpha scope — no auto-fix, DOM-aware analysis, baseline/SARIF/GitHub Action, HTML report, MCP,
  dashboards, or LLM calls.

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

- 21bbfe1: Milestone 6B — CI & PR integration: SARIF reporter and a GitHub Action.

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

- e737152: Milestone 6C — `testpilot add ai [agent]`: safe AI guidance regeneration.

  Regenerate the AI agent guidance files (`CLAUDE.md`, `AGENTS.md`, Cursor, Copilot) **without** running
  the full scaffold. Touches only guidance files — never your tests or scaffold — and calls no LLM.

  - **Dry-run by default**: previews per-file actions and writes nothing. `--write` applies
    create/update; `--force` implies `--write` and additionally overwrites files edited after generation.
  - Reuses `doctor`'s drift classification: **missing → create**, **stale (older guidance version) →
    update**, **current → unchanged**, **hand-edited / unmarked → kept** (only overwritten with
    `--force`). User edits are never clobbered by default.
  - `[agent]` is a single id (`claude`/`codex`/`cursor`/`copilot`) or `all`; omitted, it uses
    `config.ai.agents`. An unknown agent exits **2**.
  - `--json` emits a stable report `{ command:'add', resource:'ai', dryRun, files[], summary }`; `--quiet`
    prints nothing.

  New pure helpers in `@testpilot/ai` (`resolveGuidanceAction`, `actionWrites`) keep the decision logic
  testable and shared. README, CLI-Spec, AI-Agent-Integration, and Adoption-Plan updated; `smoke:mvp`
  covers create → idempotent re-write end to end.

- 09ac258: Milestone 7A — local HTML analysis report.

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

- 65d0544: Milestone 8A — `testpilot fix`: safe mechanical fix preview.

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

### Patch Changes

- 0cade63: Milestone 4C — MVP release-readiness polish.

  - Consistency fix: `testpilot analyze` now prints its human report to **stdout** (matching
    `doctor`/`explain`/`init`); it previously went to stderr. `--json` and `--quiet` behavior unchanged.
  - Added a fast, offline `pnpm smoke:mvp` script (`scripts/smoke-mvp.mjs`) covering help/version,
    `explain --json`, `doctor --json`, `analyze` on a temp spec, and `init` scaffolding (expected
    files, generated parallel/sample scripts, plain-Playwright README note, and overwrite protection).
  - Docs brought current: README (MVP complete + Development/release section), CLI-Spec status,
    Roadmap (Phases 1–4 marked delivered), GitHub-Issues (MVP P0 epics delivered), and a new
    `docs/Release-Checklist.md` (release gate + dependency-PR triage notes).

  No feature expansion: no auto-fix, DOM-aware analysis, AI, HTML/SARIF, MCP, or dashboards.
  Playwright remains the runner.
