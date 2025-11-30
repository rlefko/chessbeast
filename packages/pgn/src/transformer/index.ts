/**
 * Analysis to PGN transformation utilities
 *
 * @module transformer
 */

export {
  transformAnalysisToGame,
  hasAnnotations,
  countAnnotations,
} from './analysis-transformer.js';

export type {
  TransformOptions,
  GameAnalysisInput,
  GameAnalysisMetadata,
  MoveAnalysisInput,
  AlternativeMove,
  EngineEvaluation,
  AnalysisMetadata,
  ExploredVariation,
} from './analysis-transformer.js';
