/**
 * Narration Module
 *
 * Post-write comment synthesis system for generating natural language
 * annotations from structured comment intents.
 *
 * Key components:
 * - Intents: Define what to comment on and why
 * - Density: Control comment distribution to avoid overwhelming
 * - Redundancy: Prevent repeating the same ideas
 * - Narrator: Generate the actual comment text
 */

// Intent types and generation
export type {
  CommentIntentType,
  IntentContent,
  IntentScoreBreakdown,
  CommentIntent,
  IntentGeneratorConfig,
  IntentInput,
} from './intents.js';

export {
  INTENT_SCORE_WEIGHTS,
  DEFAULT_INTENT_CONFIG,
  determineIntentType,
  calculateInstructionalValue,
  calculateRedundancyPenalty as calculateIntentRedundancyPenalty,
  calculateThemeNovelty,
  calculateIntentScore,
  extractIdeaKeys,
  determineSuggestedLength,
  isMandatoryIntent,
  createCommentIntent,
  sortIntentsByPriority,
  getIntentTypeDescription,
} from './intents.js';

// Density control
export type { DensityLevel, DensityConfig, DensityFilterResult } from './density.js';

export {
  DENSITY_CONFIGS,
  DensityFilter,
  createDensityFilter,
  calculateIdealPositions,
  compressAdjacentIntents,
  selectRepresentativeIntent,
  shouldBypassDensity,
  recommendDensityLevel,
} from './density.js';

// Redundancy detection
export type {
  RedundancyFilterConfig,
  RedundancyFilterResult,
  RedundancyReason,
  IntentRedundancyAnalysis,
} from './redundancy.js';

export {
  DEFAULT_REDUNDANCY_CONFIG,
  RedundancyFilter,
  createRedundancyFilter,
  isIdeaRedundant,
  calculateBatchRedundancy,
  findFreshestIdeas,
  mergeRedundancyResults,
} from './redundancy.js';

// Narrator
export type {
  AudienceLevel,
  NarratorConfig,
  GeneratedNarration,
  NarrationResult,
  NarratorInput,
} from './narrator.js';

export { DEFAULT_NARRATOR_CONFIG, Narrator, createNarrator, narrateIntents } from './narrator.js';
