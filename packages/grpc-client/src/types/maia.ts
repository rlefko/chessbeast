/**
 * Maia service types
 * Matches definitions in services/protos/maia.proto
 */

/**
 * Request for move prediction
 */
export interface PredictRequest {
  /** Position in FEN notation */
  fen: string;
  /** Target rating for prediction */
  ratingBand: number;
}

/**
 * A predicted move with probability
 */
export interface MovePrediction {
  /** Move in UCI format */
  move: string;
  /** Probability (0.0 - 1.0) */
  probability: number;
}

/**
 * Move prediction response
 */
export interface PredictResponse {
  /** Predicted moves sorted by probability (descending) */
  predictions: MovePrediction[];
}

/**
 * A move played in a game (for rating estimation)
 */
export interface GameMove {
  /** Position before the move (FEN) */
  fen: string;
  /** Move played in UCI format */
  playedMove: string;
}

/**
 * Request for rating estimation
 */
export interface EstimateRatingRequest {
  /** Sequence of moves played */
  moves: GameMove[];
}

/**
 * Rating estimation response
 */
export interface EstimateRatingResponse {
  /** Point estimate of player rating */
  estimatedRating: number;
  /** Lower bound of confidence interval */
  confidenceLow: number;
  /** Upper bound of confidence interval */
  confidenceHigh: number;
}

/**
 * Health check response
 */
export interface MaiaHealthCheckResponse {
  healthy: boolean;
  /** Rating bands with loaded models */
  loadedModels: number[];
}
