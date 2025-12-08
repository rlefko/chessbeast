/**
 * LLM Roles Module
 *
 * Narrow LLM roles for chess annotation:
 * - Narrator: Post-write comment generation
 * - Tiebreaker: Candidate selection when algorithmically ambiguous
 * - Didactic: Audience-aware comment reframing
 */

// Role types
export type {
  AudienceLevel,
  CommentStyle,
  LLMRole,
  RoleConfig,
  RoleError,
  RoleResultBase,
} from './types.js';

export {
  AUDIENCE_DESCRIPTIONS,
  DIDACTIC_ROLE_CONFIG,
  getRoleConfig,
  isRoleError,
  NARRATOR_ROLE_CONFIG,
  ROLE_CONFIGS,
  STYLE_DESCRIPTIONS,
  TIEBREAKER_ROLE_CONFIG,
} from './types.js';

// Narrator role
export type { NarratorRoleConfig } from './narrator-role.js';

export { createNarratorRole, DEFAULT_NARRATOR_ROLE_CONFIG, NarratorRole } from './narrator-role.js';

// Tiebreaker role
export type { TiebreakerRoleConfig } from './tiebreaker-role.js';

export {
  createTiebreakerRole,
  DEFAULT_TIEBREAKER_ROLE_CONFIG,
  needsTiebreaker,
  TiebreakerRole,
} from './tiebreaker-role.js';

// Didactic role
export type { DidacticRoleConfig } from './didactic-role.js';

export {
  COMPLEX_CHESS_TERMS,
  createDidacticRole,
  DEFAULT_DIDACTIC_ROLE_CONFIG,
  DidacticRole,
  getComplexTermsForAudience,
  needsReframing,
} from './didactic-role.js';
