/**
 * Agent Cards Module
 *
 * Compact structured representation of position state for LLM input.
 * Provides efficient token usage while preserving essential context
 * for comment generation and exploration decisions.
 */

// Types
export type {
  AgentCard,
  CandidateSummary,
  CompactEval,
  DidacticInput,
  DidacticResult,
  LineContextSnapshot,
  NarratorRoleInput,
  NarratorRoleResult,
  OutputConstraints,
  ParentDelta,
  ThemeDeltaSummary,
  TiebreakerInput,
  TiebreakerResult,
  WDL,
} from './types.js';

export { DEFAULT_OUTPUT_CONSTRAINTS } from './types.js';

// Builder
export type { AgentCardBuilderConfig, AgentCardInput } from './agent-card-builder.js';

export {
  AgentCardBuilder,
  createAgentCardBuilder,
  createLineContextSnapshot,
  DEFAULT_BUILDER_CONFIG,
  summarizeCandidate,
  summarizeThemeDelta,
} from './agent-card-builder.js';

// Schemas
export type { JSONSchema, ValidationError, ValidationResult } from './schemas.js';

export {
  AGENT_CARD_SCHEMA,
  CANDIDATE_SUMMARY_SCHEMA,
  COMPACT_EVAL_SCHEMA,
  DIDACTIC_INPUT_SCHEMA,
  LINE_CONTEXT_SNAPSHOT_SCHEMA,
  NARRATOR_INPUT_SCHEMA,
  OUTPUT_CONSTRAINTS_SCHEMA,
  PARENT_DELTA_SCHEMA,
  THEME_DELTA_SUMMARY_SCHEMA,
  TIEBREAKER_INPUT_SCHEMA,
  validateAgainstSchema,
  validateAgentCard,
  validateDidacticInput,
  validateNarratorInput,
  validateTiebreakerInput,
  WDL_SCHEMA,
} from './schemas.js';
