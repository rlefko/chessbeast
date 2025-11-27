/**
 * Stockfish gRPC client implementation
 */

import type {
  EvaluateResponse,
  StockfishHealthCheckResponse,
  EvaluateOptions,
} from '../types/stockfish.js';

import { BaseGrpcClient, ClientConfig } from './base.js';

/**
 * Default configuration for Stockfish client
 */
export const DEFAULT_STOCKFISH_CONFIG: ClientConfig = {
  host: 'localhost',
  port: 50051,
  timeoutMs: 300000, // 5 minutes for deep analysis
};

/**
 * Client for Stockfish chess engine service
 */
export class StockfishClient extends BaseGrpcClient {
  constructor(config: Partial<ClientConfig> = {}) {
    super({
      ...DEFAULT_STOCKFISH_CONFIG,
      ...config,
    });
  }

  protected getProtoPath(): string {
    return 'stockfish.proto';
  }

  protected getServiceName(): string {
    return 'StockfishService';
  }

  protected getPackageName(): string {
    return 'chessbeast.stockfish';
  }

  /**
   * Evaluate a chess position using Stockfish
   *
   * @param fen - Position in FEN notation
   * @param options - Evaluation options (depth, time limit, etc.)
   * @returns Evaluation result with centipawns/mate score and best line
   */
  async evaluate(fen: string, options: EvaluateOptions = {}): Promise<EvaluateResponse> {
    const request = {
      fen,
      depth: options.depth ?? 0,
      timeLimitMs: options.timeLimitMs ?? 0,
      multipv: options.multipv ?? 1,
      nodes: options.nodes ?? 0,
    };

    const response = await this.unaryCall<typeof request, RawEvaluateResponse>('evaluate', request);

    return transformEvaluateResponse(response);
  }

  /**
   * Check if the Stockfish service is healthy
   */
  async healthCheck(): Promise<StockfishHealthCheckResponse> {
    const response = await this.unaryCall<Record<string, never>, RawHealthCheckResponse>(
      'healthCheck',
      {},
    );

    return {
      healthy: response.healthy,
      version: response.version,
    };
  }
}

/**
 * Raw response from gRPC (with snake_case from proto)
 * Proto-loader converts to camelCase, but we still need to handle nested arrays
 */
interface RawEvaluateResponse {
  cp: number;
  mate: number;
  depth: number;
  bestLine: string[];
  alternatives: RawEvaluateResponse[];
}

interface RawHealthCheckResponse {
  healthy: boolean;
  version: string;
}

/**
 * Transform raw gRPC response to typed response
 */
function transformEvaluateResponse(raw: RawEvaluateResponse): EvaluateResponse {
  return {
    cp: raw.cp,
    mate: raw.mate,
    depth: raw.depth,
    bestLine: raw.bestLine || [],
    alternatives: (raw.alternatives || []).map(transformEvaluateResponse),
  };
}
