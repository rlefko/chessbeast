/**
 * Maia gRPC client implementation
 */

import type {
  PredictResponse,
  MovePrediction,
  GameMove,
  EstimateRatingResponse,
  MaiaHealthCheckResponse,
} from '../types/maia.js';

import { BaseGrpcClient, ClientConfig } from './base.js';

/**
 * Default configuration for Maia client
 */
export const DEFAULT_MAIA_CONFIG: ClientConfig = {
  host: 'localhost',
  port: 50052,
  timeoutMs: 30000,
};

/**
 * Client for Maia human-likeness prediction service
 */
export class MaiaClient extends BaseGrpcClient {
  constructor(config: Partial<ClientConfig> = {}) {
    super({
      ...DEFAULT_MAIA_CONFIG,
      ...config,
    });
  }

  protected getProtoPath(): string {
    return 'maia.proto';
  }

  protected getServiceName(): string {
    return 'MaiaService';
  }

  protected getPackageName(): string {
    return 'chessbeast.maia';
  }

  /**
   * Predict the most likely human moves for a position
   *
   * @param fen - Position in FEN notation
   * @param ratingBand - Target rating for prediction
   * @returns Predicted moves with probabilities
   */
  async predict(fen: string, ratingBand: number): Promise<PredictResponse> {
    const request = {
      fen,
      ratingBand,
    };

    const response = await this.unaryCall<typeof request, RawPredictResponse>(
      'predictMoves',
      request
    );

    return {
      predictions: (response.predictions || []).map(transformMovePrediction),
    };
  }

  /**
   * Estimate player rating from a sequence of moves
   *
   * @param moves - Sequence of (fen, playedMove) pairs
   * @returns Estimated rating with confidence interval
   */
  async estimateRating(moves: GameMove[]): Promise<EstimateRatingResponse> {
    const request = {
      moves: moves.map((m) => ({
        fen: m.fen,
        playedMove: m.playedMove,
      })),
    };

    const response = await this.unaryCall<typeof request, RawEstimateRatingResponse>(
      'estimateRating',
      request
    );

    return {
      estimatedRating: response.estimatedRating,
      confidenceLow: response.confidenceLow,
      confidenceHigh: response.confidenceHigh,
    };
  }

  /**
   * Check if the Maia service is healthy
   */
  async healthCheck(): Promise<MaiaHealthCheckResponse> {
    const response = await this.unaryCall<Record<string, never>, RawHealthCheckResponse>(
      'healthCheck',
      {}
    );

    return {
      healthy: response.healthy,
      loadedModels: response.loadedModels || [],
    };
  }
}

/**
 * Raw response types from gRPC
 */
interface RawMovePrediction {
  move: string;
  probability: number;
}

interface RawPredictResponse {
  predictions: RawMovePrediction[];
}

interface RawEstimateRatingResponse {
  estimatedRating: number;
  confidenceLow: number;
  confidenceHigh: number;
}

interface RawHealthCheckResponse {
  healthy: boolean;
  loadedModels: number[];
}

/**
 * Transform raw move prediction
 */
function transformMovePrediction(raw: RawMovePrediction): MovePrediction {
  return {
    move: raw.move,
    probability: raw.probability,
  };
}
