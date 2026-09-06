import type { RuleExplanation } from '@testpilot/core'

/**
 * Renders one rule's Markdown page (`docs/rules/<id>.md`) from its explanation —
 * the same source `testpilot explain` prints, so the linked docs never drift from
 * the CLI. Regenerate with `pnpm docs:rules`; a test fails when they differ.
 */
export function renderRuleDoc(explanation: RuleExplanation): string {
  const guidance = explanation.guidance.map((line) => `- ${line}`).join('\n')
  return [
    `# \`${explanation.id}\` — ${explanation.title}`,
    '',
    '<!-- Generated from packages/locator-intelligence/src/explanations.ts by `pnpm docs:rules`. Do not edit by hand. -->',
    '',
    `> **Category:** ${explanation.category} · **Default severity:** ${severityLabel(explanation)}`,
    '',
    explanation.summary,
    '',
    '## Why it matters',
    '',
    explanation.whyItMatters,
    '',
    '## Example',
    '',
    '**Avoid**',
    '',
    '```ts',
    explanation.badExample,
    '```',
    '',
    '**Prefer**',
    '',
    '```ts',
    explanation.betterExample,
    '```',
    '',
    '## Guidance',
    '',
    guidance,
    '',
    '## In the CLI',
    '',
    `- \`testpilot explain ${explanation.id}\` prints this page in the terminal.`,
    `- Disable or re-level it in \`testpilot.config.ts\`: \`rules: { '${explanation.id}': 'off' | 'info' | 'warn' | 'error' }\`.`,
    '- Adopting on an existing suite? Record a baseline (`testpilot analyze --baseline testpilot-baseline.json --update-baseline`) and gate on new findings only.',
    '',
    '[← All rules](README.md)',
    '',
  ].join('\n')
}

/** Renders the `docs/rules/README.md` index. */
export function renderRuleIndex(explanations: RuleExplanation[]): string {
  const rows = [...explanations]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (e) => `| [\`${e.id}\`](${e.id}.md) | ${e.category} | ${severityLabel(e)} | ${e.summary} |`,
    )
    .join('\n')
  return [
    '# TestPilot QA rules',
    '',
    '<!-- Generated from packages/locator-intelligence/src/explanations.ts by `pnpm docs:rules`. Do not edit by hand. -->',
    '',
    'Every rule `testpilot analyze` can report, with why it matters and what to write instead. All',
    'rules are static (Tier 1): they read your test source and never touch a browser or the DOM.',
    '',
    '| Rule | Category | Default | Summary |',
    '|---|---|---|---|',
    rows,
    '',
    'How findings turn into the 0–100 Locator Quality Score is documented in [Scoring.md](../Scoring.md).',
    '',
  ].join('\n')
}

/**
 * "off (info when enabled)" for an opt-in rule.
 *
 * Printing the bare `defaultSeverity` claimed the rule ships on, in the one
 * table a browsing user reads.
 */
function severityLabel(explanation: RuleExplanation): string {
  return explanation.defaultOff === true
    ? `off (\`${explanation.defaultSeverity}\` when enabled)`
    : explanation.defaultSeverity
}
