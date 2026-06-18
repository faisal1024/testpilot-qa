import type { RuleExplanation } from '@testpilot/core'

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')
}

/**
 * Renders a rule explanation for the terminal. Presentation only — the data
 * lives in @testpilot/locator-intelligence so the CLI stays thin.
 */
export function renderExplanationText(explanation: RuleExplanation): string {
  return [
    `${explanation.id}  [${explanation.defaultSeverity}] ${explanation.category}`,
    explanation.title,
    '',
    explanation.summary,
    '',
    'Why it matters',
    indent(explanation.whyItMatters),
    '',
    '✗ Bad',
    indent(explanation.badExample),
    '',
    '✓ Better',
    indent(explanation.betterExample),
    '',
    'Guidance',
    ...explanation.guidance.map((item) => `  - ${item}`),
    '',
    `Docs: ${explanation.docsUrl}`,
  ].join('\n')
}
