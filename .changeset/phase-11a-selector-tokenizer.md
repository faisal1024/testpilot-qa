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
- **`no-css-class-selector` now reads the parse.** Measured on the corpus: **29 false positives
  removed** (dots inside attribute values such as `[name="meta.subject"]`, and `text=/regex/` parts
  that are not CSS at all) and **1 true positive recovered** — a class nested inside `:has()`, which
  the regex only reached by accident and a naive tokenizer would have missed. `filesAnalyzed`,
  `callSites` and `parseErrors` are unchanged; the benchmark's evidence gate is untouched.
- The finding now names the classes it found, so it is actionable without opening the file.
- **Rule docs gain a "Does not fire on" section**, generated from a new `notFlagged` list — and a
  test executes every example against its own rule, so the list is a fact rather than a promise.
