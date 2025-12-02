/**
 * Analysis type exports
 *
 * Re-exports analysis types from @chessbeast/core.
 * This provides a stable import path from @chessbeast/types/analysis.
 */

// Re-export all analysis types from core
// These are the segregated interfaces following ISP
export type {
  // Engine evaluation types
  EngineEvaluation,
  NormalizedEval,
  AlternativeMove,
  MaiaPrediction,
  // Move analysis - segregated interfaces (ISP)
  MoveIdentity,
  MoveEvaluation,
  MoveClassificationData,
  MoveAlternatives,
  MoveHumanPrediction,
  MoveAnnotation,
  MoveAnalysis,
  // Critical moments
  CriticalMoment,
  CriticalMomentType,
  GamePhase,
  // Game analysis - segregated interfaces (ISP)
  GameMetadata,
  GameAnalysisResults,
  GameStatistics,
  GameSummaryData,
  GameAnalysis,
  // Statistics
  GameStats,
  PlayerStats,
} from '@chessbeast/core';

// Re-export MoveClassification
export type { MoveClassification } from '@chessbeast/core';
