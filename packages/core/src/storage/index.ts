/**
 * Storage Module
 *
 * Position-keyed artifact storage with Zobrist hashing,
 * DAG-based variation trees, and in-memory caching.
 *
 * Architecture:
 * - Position Keys: Zobrist hash + normalized FEN for O(1) lookups
 * - Artifacts: Immutable analysis results with schema versioning
 * - Variation DAG: Graph structure supporting transpositions
 * - Cache: Multi-layer LRU cache with tier-aware lookups
 */

// Position key generation
export {
  type PositionKey,
  generatePositionKey,
  computeZobristHash,
  normalizeFen,
  positionKeysEqual,
} from './position-key.js';

// Zobrist tables (rarely needed directly)
export {
  ZOBRIST_PIECE_SQUARE,
  ZOBRIST_CASTLING,
  ZOBRIST_EN_PASSANT,
  ZOBRIST_SIDE_TO_MOVE,
} from './zobrist-tables.js';

// Artifact types and utilities
export {
  // Base types
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

  // Candidate moves
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
  estimateGamePhase,
  parseSF16EvalOutput,

  // Union type
  type Artifact,
} from './artifacts/index.js';

// Variation DAG
export {
  // Node types
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
  generateNodeId,
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
} from './variation-dag/index.js';

// Cache
export {
  // Configuration
  type ArtifactCacheConfig,
  type CacheStats,
  type TypeStats,
  DEFAULT_CACHE_CONFIG,
  COMPACT_CACHE_CONFIG,
  LARGE_CACHE_CONFIG,
  createTypeStats,
  updateHitRate,

  // LRU Cache
  type LRUStats,
  type LRUOptions,
  LRUCache,
  createLRUCache,

  // Artifact Cache
  ArtifactCache,
  createArtifactCache,
} from './cache/index.js';
