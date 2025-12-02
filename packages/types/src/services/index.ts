/**
 * Service interface exports
 *
 * Service contracts that can be implemented by gRPC clients or mocks.
 * Data types are re-exported from their canonical locations.
 */

// Re-export evaluation types from core
export type { EngineEvaluation, NormalizedEval } from '@chessbeast/core';

// Re-export opening types from database
export type { OpeningInfo, OpeningLookupResult } from '@chessbeast/database';

// Re-export reference types from database
export type { ReferenceGame, ReferenceGameResult } from '@chessbeast/database';

// ============================================================================
// Service Interfaces
// These are contracts implemented by gRPC clients
// ============================================================================

import type { EngineEvaluation } from '@chessbeast/core';
import type { OpeningLookupResult } from '@chessbeast/database';

/**
 * Options for engine evaluation
 */
export interface EvaluationOptions {
  /** Search depth limit */
  depth?: number;
  /** Time limit in milliseconds (engine stops at whichever limit is reached first) */
  timeLimitMs?: number;
  /** Number of principal variations to return */
  numLines?: number;
  /** Minimum time for mate/winning positions (ms) - ensures deeper search */
  mateMinTimeMs?: number;
}

/**
 * Engine evaluation service interface
 * (Implemented by gRPC client)
 */
export interface EngineService {
  /** Evaluate a position (shallow) */
  evaluate(fen: string, depth: number): Promise<EngineEvaluation>;
  /** Evaluate a position with multiple variations */
  evaluateMultiPv(
    fen: string,
    depthOrOptions: number | EvaluationOptions,
    numLines?: number,
  ): Promise<EngineEvaluation[]>;
}

/**
 * Maia prediction (from gRPC service)
 */
export interface MaiaPrediction {
  /** Move in SAN notation */
  san: string;
  /** Probability of being played by a human at the target rating (0-1) */
  probability: number;
}

/**
 * Rating estimation result
 */
export interface RatingEstimate {
  /** Estimated rating */
  rating: number;
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Maia prediction service interface
 * (Implemented by gRPC client)
 */
export interface MaiaService {
  /** Get probability of each move being played by a human at given rating */
  predictMoves(fen: string, rating: number): Promise<MaiaPrediction[]>;
  /** Estimate player rating from moves */
  estimateRating(moves: Array<{ fen: string; san: string }>): Promise<RatingEstimate>;
}

/**
 * Opening database service interface
 * (Implemented by database client)
 */
export interface OpeningService {
  /** Look up opening from move sequence (UCI format) */
  getOpeningByMoves(movesUci: string[]): OpeningLookupResult;
}

/**
 * Minimal reference game info (subset of ReferenceGame for service interface)
 */
export interface ReferenceGameInfo {
  white: string;
  black: string;
  result: string;
  whiteElo?: number;
  blackElo?: number;
  eco?: string;
}

/**
 * Reference game database service interface
 * (Implemented by database client)
 */
export interface ReferenceGameService {
  /** Get reference games that reached a position */
  getReferenceGames(
    fen: string,
    limit?: number,
  ): { games: ReferenceGameInfo[]; totalCount: number };
}
