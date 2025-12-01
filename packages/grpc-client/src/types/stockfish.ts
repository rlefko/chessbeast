/**
 * Stockfish service types
 * Matches definitions in services/protos/stockfish.proto
 */

/**
 * Request for position evaluation
 */
export interface EvaluateRequest {
  /** Position in FEN notation */
  fen: string;
  /** Search depth (0 = use time limit) */
  depth?: number;
  /** Time limit in milliseconds */
  timeLimitMs?: number;
  /** Number of principal variations (default 1) */
  multipv?: number;
  /** Node limit (0 = no limit) */
  nodes?: number;
  /** Minimum time for mate/winning positions (0 = disabled) */
  mateMinTimeMs?: number;
}

/**
 * Evaluation result
 */
export interface EvaluateResponse {
  /** Centipawns (from side to move's perspective) */
  cp: number;
  /** Mate in N moves (0 if not mate, positive = side to move wins) */
  mate: number;
  /** Actual depth searched */
  depth: number;
  /** Best line in UCI notation */
  bestLine: string[];
  /** MultiPV results (alternatives) */
  alternatives: EvaluateResponse[];
}

/**
 * Health check response
 */
export interface StockfishHealthCheckResponse {
  healthy: boolean;
  /** Stockfish version string */
  version: string;
}

/**
 * Options for evaluate method (convenience wrapper)
 */
export interface EvaluateOptions {
  /** Search depth */
  depth?: number;
  /** Time limit in milliseconds */
  timeLimitMs?: number;
  /** Number of principal variations (default 1) */
  multipv?: number;
  /** Node limit */
  nodes?: number;
  /** Minimum time for mate/winning positions (0 = disabled) */
  mateMinTimeMs?: number;
}
