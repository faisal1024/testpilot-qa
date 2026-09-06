---
'@testpilot/locator-intelligence': minor
'@testpilot/core': minor
'testpilot-qa': minor
---

Phase 11b + 11g — the noisiest rule splits, and the report says what it could not read.

**`prefer-user-facing-locator` is replaced by two rules.** It was 65% of every finding TestPilot
reported on a five-repo corpus, at `warn`, whether the selector was `[data-testid="save"]` (a
mechanical rewrite) or `#login-form div.actions > button` (a judgement call).

- **`prefer-get-by-test-id`** (`warn`, 502 corpus findings) — a test id addressed through a raw CSS
  attribute selector. What it says depends on where the test id sits, because the three cases do not
  have the same fix: on the target alone → `Use getByTestId('save')` (417); on an ancestor →
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
  step (`[data-testid="row"] + button` puts it on a sibling), a `>>` part *preceding* the test id
  (`#modal >> [data-testid=x]` — an ancestor scope `getByTestId()` would drop), and a call whose own
  options carry a filter (`locator('[data-testid=row]', { hasText: 'Alice' })` is not
  `getByTestId('row')`, which selects every row). A chained `.filter()` still reports, because it
  survives the rewrite.
- **`prefer-semantic-locator`** (`info`, 1174 corpus findings) — a selector with no role, label or
  ARIA handle. It stays quiet on `[role=]`/`[aria-*]`, on content composition in **either**
  spelling (`{ has, hasNot, hasText, hasNotText }`, `.filter({ hasText })`, `:has()`, `:has-text()`,
  `:text()`), on a `locator()` narrowing a `getBy*()` parent — including through
  `.filter()`/`.first()`/`.last()`/`.nth()` — and on test ids.

**A config or baseline written against the old id keeps working**: `prefer-user-facing-locator` maps
to both successors and carries its severity to them, with a `deprecated-rule-id` warning. It is no
longer *also* reported as an unknown rule — the report used to say "unknown — ignored" and "taking
its setting" about the same line.

Measured on the corpus: **1973 findings became 1676**. Reasons the 297 no longer fire, counted
independently — **a call site can appear in more than one row**, so these do not partition:
253 composed with a `has`/`hasText` option (167 of them via `.filter()`, which the rules could not
previously see), 35 carrying `role=`/`aria-*`, 21 chained off a `getBy*()` parent, 12 composed with
`:has()`/`:has-text()`, 1 a test id with no `getByTestId()` form, 0 unreadable.

Scores rise (cal.com 74→82, immich 91→96, documenso 91→94, mattermost 67→76, Ghost 99 unchanged)
from re-grading 1174 findings `warn`→`info` plus those removals; `callSites` is identical on all
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
