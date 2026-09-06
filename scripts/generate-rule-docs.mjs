// Regenerates docs/rules/*.md from the rule explanations. Requires a prior build
// (`pnpm -r build`). A test fails when the committed docs drift from this output.
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  renderRuleDoc,
  renderRuleIndex,
  ruleExplanations,
} from '../packages/locator-intelligence/dist/index.js'

const outDir = fileURLToPath(new URL('../docs/rules/', import.meta.url))
mkdirSync(outDir, { recursive: true })
const explanations = Object.values(ruleExplanations)
for (const explanation of explanations) {
  writeFileSync(`${outDir}${explanation.id}.md`, renderRuleDoc(explanation))
}
writeFileSync(`${outDir}README.md`, renderRuleIndex(explanations))
console.log(`Wrote ${explanations.length} rule docs + index to docs/rules/`)
