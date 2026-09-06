---
"testpilot-qa": minor
"@testpilot/core": minor
"@testpilot/locator-intelligence": minor
---

A real selector tokenizer, and `no-css-class-selector` stops guessing.

Every rule that reasoned about selectors used a regex, and they were all wrong on the same three
inputs — which are not exotic, they are what real suites contain:

| selector | the old regex | reality |
|---|---|---|
| `[href=".pdf"]` | a class `.pdf` | a dot inside a quoted attribute value |
| `.mt-1\.5` | two classes | one Tailwind class |
| `a, b` | a descendant chain | a selector list |

- **New `packages/locator-intelligence/src/selector/`** — a one-pass tokenizer for Playwright's
  selector syntax: CSS selector lists, compound selectors, attribute values (quoted, unquoted,
  escaped, with the `i` flag), identifier escapes, pseudo-classes with balanced nested arguments,
  and the `>>` engine-chaining operator with each part tagged by engine (`css`, `text`, `xpath`,
  `id`, `role`, `test-id`, …). Selectors are tokenized **once per call site** in the extractor and
  shared, so six rules cannot form six different opinions of one string.
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
  as an oracle: over all 655 statically-known selectors in the corpus it asserts we never accept
  what Playwright rejects, and tracks how often we abstain where it parses. Currently **zero in both
  directions**. A hand-written parser for someone else's syntax drifts; this is what makes
  maintaining one defensible.
