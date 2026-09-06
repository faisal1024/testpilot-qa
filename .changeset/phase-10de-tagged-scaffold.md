---
"testpilot-qa": minor
"@testpilot/core": minor
"@testpilot/locator-intelligence": minor
---

Tagged scaffold, tag guidance for AI agents, and an opt-in `require-test-tag` rule.

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
- **Its findings are counted but not scored.** The Locator Quality Score's denominator is locator
  call sites; a per-test rule has no relation to it (on Ghost — 95 call sites, 321 tests — scoring
  it would drop a 98 to roughly 64). `summary.unscoredFindings` reports the exclusion rather than
  applying it silently. **`analyze` schema `1.8` → `1.9`.**
- The rule engine gains a second rule kind (`TestRule`, over a `test()` declaration rather than a
  locator call site) — the shape any rule about test *organization* needs. Extracting declarations
  is a second AST pass, so `analyze` only does it when such a rule is actually enabled.
