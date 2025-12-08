/**
 * @chessbeast/core - Core analysis logic for ChessBeast
 *
 * This package contains the main analysis pipeline including:
 * - Move classification (inaccuracy, mistake, blunder)
 * - Critical moment detection
 * - Annotation planning
 */

export const VERSION = '0.1.0';

/**
 * Move classification categories
 */
export type MoveClassification =
  | 'book'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'brilliant'
  | 'forced';

// Re-export types
export * from './types/index.js';

// Re-export classifier utilities
export * from './classifier/index.js';

// Re-export pipeline
export * from './pipeline/index.js';

// Re-export exploration
export * from './exploration/index.js';

// Re-export storage (artifacts, cache, position keys)
// Selectively export to avoid naming conflicts with classifier and exploration modules
export {
  // Position key generation
  type PositionKey,
  generatePositionKey,
  computeZobristHash,
  normalizeFen,
  positionKeysEqual,

  // Base types
  type AnalysisTier,
  type ArtifactKind,
  type BaseArtifact,
  type ArtifactRef,
  type TierConfig,
  TIER_CONFIGS,
  getTierConfig,
  tierAtLeast,

  // Engine evaluation
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

  // Theme detection
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

  // Candidate moves (use CandidateMovesArtifact types from storage)
  type CandidateSource,
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

  // Move assessment
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

  // HCE (classical evaluation)
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
  parseSF16EvalOutput,

  // Union type
  type Artifact,

  // DAG types (skip generateNodeId to avoid conflict with exploration)
  type NodeId,
  type EdgeId,
  type NodeSource,
  type NodeMetadata,
  type DecisionRef,
  type VariationNode,
  createVariationNode,
  visitNode,
  addArtifactRef,
  getArtifactRef,
  addDecisionRef,
  markInteresting,
  clearInteresting,
  isRootNode,
  isLeafNode,
  isTransposition,
  resetNodeIdCounter,

  // Edge types
  type EdgeSource,
  type EdgeMetadata,
  type VariationEdge,
  createVariationEdge,
  setEdgeComment,
  addEdgeNag,
  removeEdgeNag,
  setEdgeNags,
  clearEdgeNags,
  setMoveAssessmentRef,
  setPrincipal,
  generateEdgeId,
  resetEdgeIdCounter,
  getNagString,
  hasAnnotations,
  getEdgeDisplayString,

  // DAG manager
  type AddMoveResult,
  type NavigationResult,
  type DagPath,
  VariationDAG,
  createVariationDAG,

  // Cache
  type ArtifactCacheConfig,
  type CacheStats,
  type TypeStats,
  DEFAULT_CACHE_CONFIG,
  COMPACT_CACHE_CONFIG,
  LARGE_CACHE_CONFIG,
  createTypeStats,
  updateHitRate,
  type LRUStats,
  type LRUOptions,
  LRUCache,
  createLRUCache,
  ArtifactCache,
  createArtifactCache,
} from './storage/index.js';
