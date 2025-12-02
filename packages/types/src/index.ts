/**
 * @chessbeast/types - Shared type definitions for ChessBeast
 *
 * This package provides a stable import location for types used across
 * multiple packages. Types are re-exported from their canonical sources.
 *
 * Usage:
 *   import type { MoveAnalysis, GameAnalysis } from '@chessbeast/types';
 *   import type { EngineService, MaiaService } from '@chessbeast/types/services';
 *   import type { CommentType, CommentLimits } from '@chessbeast/types/annotation';
 */

// Re-export analysis types
export * from './analysis/index.js';

// Re-export annotation types
export * from './annotation/index.js';

// Re-export service types (excluding MaiaPrediction to avoid conflict with core's MaiaPrediction)
export type {
  EngineEvaluation,
  NormalizedEval,
  OpeningInfo,
  OpeningLookupResult,
  ReferenceGame,
  ReferenceGameResult,
  EvaluationOptions,
  EngineService,
  // Note: MaiaPrediction from services is different from core's MaiaPrediction
  // Use import from '@chessbeast/types/services' for the service-level type
  MaiaService,
  RatingEstimate,
  OpeningService,
  ReferenceGameInfo,
  ReferenceGameService,
} from './services/index.js';

// Service-level MaiaPrediction (san, probability) - distinct from core's MaiaPrediction (topMoves array)
export type { MaiaPrediction as ServiceMaiaPrediction } from './services/index.js';
