/**
 * Artifact type exports
 *
 * All artifact types for the Position Artifact Store.
 */

// Base types and utilities
export {
  type AnalysisTier,
  type ArtifactKind,
  type BaseArtifact,
  type ArtifactRef,
  type TierConfig,
  TIER_CONFIGS,
  getTierConfig,
  tierAtLeast,
  engineEvalArtifactKey,
  themeArtifactKey,
  candidatesArtifactKey,
  moveAssessmentArtifactKey,
  hceArtifactKey,
  createBaseArtifact,
  artifactMatchesRef,
} from './base.js';

// Engine evaluation artifact
export {
  type PVLine,
  type WDLProbs,
  type EngineEvalArtifact,
  createEngineEvalArtifact,
  evalMeetsRequirements,
  getBestMove,
  getEvalCp,
  getMateIn,
  wdlToWinProbability,
  estimateWdlFromCp,
} from './engine-eval.js';

// Theme artifact
export {
  type ThemeCategory,
  type ThemeType,
  type ThemeSeverity,
  type ThemeConfidence,
  type ThemePieceInfo,
  type DetectedTheme,
  type ThemeArtifact,
  getThemeCategory,
  getThemeName,
  confidenceToLevel,
  createDetectedTheme,
  createThemeArtifact,
  filterThemesBySeverity,
  groupThemes,
  generateThemeKey,
} from './theme.js';

// Candidate moves artifact
export {
  type CandidateSource,
  type CandidateMove,
  type CandidateSelectionMeta,
  type CandidateMovesArtifact,
  CANDIDATE_SOURCE_PRIORITY,
  DEFAULT_SELECTION_META,
  createCandidateMovesArtifact,
  determinePrimarySource,
  classifyCandidate,
  createCandidateMove,
  filterCandidatesBySource,
  sortCandidatesByPriority,
} from './candidates.js';

// Move assessment artifact
export {
  type AssessmentSeverity,
  type MoveNag,
  type PositionNag,
  type MoveTag,
  type MoveAssessmentArtifact,
  NAG_SYMBOLS,
  nagToSymbol,
  calculateSeverity,
  determineNag,
  createMoveAssessmentArtifact,
  isCriticalMoment,
  getAssessmentSummary,
} from './move-assessment.js';

// HCE (classical evaluation) artifact
export {
  type PhaseScore,
  type HCEFactors,
  type HCEArtifact,
  zeroPhaseScore,
  blendPhaseScore,
  createDefaultHCEFactors,
  createHCEArtifact,
  getTopPositiveFactors,
  getTopNegativeFactors,
  HCE_FACTOR_NAMES,
  getFactorName,
  formatFactorScore,
  getHCESummary,
  estimateGamePhase,
  parseSF16EvalOutput,
} from './hce.js';

/**
 * Union type of all artifact types
 */
export type Artifact =
  | import('./engine-eval.js').EngineEvalArtifact
  | import('./theme.js').ThemeArtifact
  | import('./candidates.js').CandidateMovesArtifact
  | import('./move-assessment.js').MoveAssessmentArtifact
  | import('./hce.js').HCEArtifact;
