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

// DAG transformation (Ultra-Fast Coach architecture)
export {
  transformDagToMoves,
  countDagMoves,
  getPrincipalVariation,
} from './dag-transformer.js';

export type {
  DagNode,
  DagEdge,
  DagLike,
  DagTransformerOptions,
} from './dag-transformer.js';
