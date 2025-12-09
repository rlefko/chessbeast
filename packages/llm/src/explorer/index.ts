/**
 * Variation Explorer module
 *
 * Provides variation exploration for chess analysis.
 */

// Original variation explorer (used by Annotator)
export {
  VariationExplorer,
  createVariationExplorer,
  type ExploredLine,
  type ExplorationSession,
  type ExplorationConfig,
  type LinePurpose,
  type LineSource,
  type EngineService,
  type MaiaService,
  type EngineEvaluation,
} from './variation-explorer.js';

// Candidate classification types
export {
  type CandidateSource,
  type ClassifiedCandidate,
  type CandidateClassificationConfig,
  type CommentType,
  type CommentLimits,
  CANDIDATE_SOURCE_PRIORITY,
  ATTRACTIVE_BAD_THRESHOLDS,
  COMMENT_LIMITS,
  PIECE_VALUES,
  getAttractiveBadThresholds,
} from './types.js';

// Candidate classifier
export {
  classifyCandidates,
  getDefaultConfig,
  isCheck,
  isCapture,
  getPieceType,
  isAttractiveBad,
  getPrimarySource,
  generateSourceReason,
  type EngineCandidate,
  type MaiaPrediction,
} from './candidate-classifier.js';

// Engine-driven explorer (Ultra-Fast Coach architecture)
export {
  EngineDrivenExplorer,
  createEngineDrivenExplorer,
  type EngineDrivenExplorerConfig,
  type EngineDrivenExplorerProgress,
  type EngineDrivenExplorerResult,
  type ThemeVerbosity,
} from './engine-driven-explorer.js';
