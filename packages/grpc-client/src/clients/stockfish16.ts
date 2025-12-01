/**
 * Stockfish 16 classical evaluation gRPC client implementation
 */

import type {
  ClassicalEvalResponse,
  Stockfish16HealthCheckResponse,
  PhaseScore,
  SideBreakdown,
} from '../types/stockfish16.js';

import { BaseGrpcClient, ClientConfig } from './base.js';

/**
 * Default configuration for Stockfish 16 client
 */
export const DEFAULT_STOCKFISH16_CONFIG: ClientConfig = {
  host: 'localhost',
  port: 50053,
  timeoutMs: 30000, // 30 seconds (eval is fast)
};

/**
 * Client for Stockfish 16 classical evaluation service
 *
 * This client communicates with the SF16 service to get detailed
 * positional breakdown using classical evaluation terms (material,
 * mobility, king safety, threats, space, etc.).
 */
export class Stockfish16Client extends BaseGrpcClient {
  constructor(config: Partial<ClientConfig> = {}) {
    super({
      ...DEFAULT_STOCKFISH16_CONFIG,
      ...config,
    });
  }

  protected getProtoPath(): string {
    return 'stockfish16.proto';
  }

  protected getServiceName(): string {
    return 'Stockfish16Service';
  }

  protected getPackageName(): string {
    return 'chessbeast.stockfish16';
  }

  /**
   * Get classical evaluation breakdown for a position
   *
   * @param fen - Position in FEN notation
   * @returns Classical evaluation breakdown with all components
   */
  async getClassicalEval(fen: string): Promise<ClassicalEvalResponse> {
    const request = { fen };

    const response = await this.unaryCall<typeof request, RawClassicalEvalResponse>(
      'getClassicalEval',
      request,
    );

    return transformClassicalEvalResponse(response);
  }

  /**
   * Check if the Stockfish 16 service is healthy
   */
  async healthCheck(): Promise<Stockfish16HealthCheckResponse> {
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
 * Raw response from gRPC (proto-loader converts to camelCase)
 */
interface RawPhaseScore {
  mg: number;
  eg: number;
}

interface RawSideBreakdown {
  white: RawPhaseScore;
  black: RawPhaseScore;
  total: RawPhaseScore;
}

interface RawClassicalEvalResponse {
  material: RawSideBreakdown;
  imbalance: RawSideBreakdown;
  pawns: RawSideBreakdown;
  knights: RawSideBreakdown;
  bishops: RawSideBreakdown;
  rooks: RawSideBreakdown;
  queens: RawSideBreakdown;
  mobility: RawSideBreakdown;
  kingSafety: RawSideBreakdown;
  threats: RawSideBreakdown;
  passed: RawSideBreakdown;
  space: RawSideBreakdown;
  winnable: RawSideBreakdown;
  total: RawSideBreakdown;
  finalEvalCp: number;
}

interface RawHealthCheckResponse {
  healthy: boolean;
  version: string;
}

/**
 * Transform phase score with defaults
 */
function transformPhaseScore(raw: RawPhaseScore | undefined): PhaseScore {
  return {
    mg: raw?.mg ?? 0,
    eg: raw?.eg ?? 0,
  };
}

/**
 * Transform side breakdown with defaults
 */
function transformSideBreakdown(raw: RawSideBreakdown | undefined): SideBreakdown {
  return {
    white: transformPhaseScore(raw?.white),
    black: transformPhaseScore(raw?.black),
    total: transformPhaseScore(raw?.total),
  };
}

/**
 * Transform raw gRPC response to typed response
 */
function transformClassicalEvalResponse(raw: RawClassicalEvalResponse): ClassicalEvalResponse {
  return {
    material: transformSideBreakdown(raw.material),
    imbalance: transformSideBreakdown(raw.imbalance),
    pawns: transformSideBreakdown(raw.pawns),
    knights: transformSideBreakdown(raw.knights),
    bishops: transformSideBreakdown(raw.bishops),
    rooks: transformSideBreakdown(raw.rooks),
    queens: transformSideBreakdown(raw.queens),
    mobility: transformSideBreakdown(raw.mobility),
    kingSafety: transformSideBreakdown(raw.kingSafety),
    threats: transformSideBreakdown(raw.threats),
    passed: transformSideBreakdown(raw.passed),
    space: transformSideBreakdown(raw.space),
    winnable: transformSideBreakdown(raw.winnable),
    total: transformSideBreakdown(raw.total),
    finalEvalCp: raw.finalEvalCp ?? 0,
  };
}
