/**
 * @testpilot/ai — deterministic AI-agent guidance generation.
 *
 * One canonical guidance source (`CANONICAL_GUIDANCE`) drives generators for
 * CLAUDE.md, AGENTS.md, GitHub Copilot, and Cursor. Offline, no LLM calls.
 * Each file carries a marker (version + content hash) so Milestone 5B can add
 * `doctor` drift detection cleanly.
 */
export { CANONICAL_GUIDANCE } from './guidance.js'
export {
  AGENT_FILE_PATHS,
  type AgentId,
  type GeneratedFile,
  generateAgentFiles,
  SUPPORTED_AGENTS,
} from './generators.js'
export {
  extractGeneratedBody,
  GUIDANCE_VERSION,
  type GuidanceMarker,
  guidanceMarker,
  hashGuidance,
  isGuidancePristine,
  parseGuidanceMarker,
} from './marker.js'
