/**
 * @chessbeast/grpc-client - gRPC clients for ChessBeast services
 *
 * This package provides TypeScript clients for:
 * - Stockfish service (engine evaluation)
 * - Maia service (human-likeness prediction)
 */

export const VERSION = '0.1.0';

// Re-export clients
export {
  StockfishClient,
  MaiaClient,
  DEFAULT_STOCKFISH_CONFIG,
  DEFAULT_MAIA_CONFIG,
  type ClientConfig,
} from './clients/index.js';

// Re-export types
export type {
  // Common types
  Position,
  Move,
  // Stockfish types
  EvaluateRequest,
  EvaluateResponse,
  EvaluateOptions,
  StockfishHealthCheckResponse,
  // Maia types
  PredictRequest,
  PredictResponse,
  MovePrediction,
  GameMove,
  EstimateRatingRequest,
  EstimateRatingResponse,
  MaiaHealthCheckResponse,
} from './types/index.js';

// Re-export errors
export {
  GrpcClientError,
  ConnectionError,
  TimeoutError,
  InvalidArgumentError,
  ServiceUnavailableError,
  InternalError,
  mapGrpcError,
} from './errors.js';

/**
 * @deprecated Use ClientConfig instead
 */
export interface ServiceConfig {
  host: string;
  port: number;
}
