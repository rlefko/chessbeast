/**
 * Mock Maia model client for testing
 *
 * Implements the MaiaClient interface used by the adapter
 */

import { vi } from 'vitest';

/**
 * Move prediction from Maia
 */
export interface MovePrediction {
  move: string;
  probability: number;
}

/**
 * Predict response matching MaiaClient.predict() return type
 */
export interface PredictResponse {
  predictions: MovePrediction[];
}

/**
 * Estimate rating response matching MaiaClient.estimateRating() return type
 */
export interface EstimateRatingResponse {
  estimatedRating: number;
  confidenceLow: number;
  confidenceHigh: number;
}

export interface MockMaiaConfig {
  /** Predefined responses for specific FEN positions */
  responses?: Map<string, PredictResponse>;
  /** Default prediction to return when no match found */
  defaultPrediction?: PredictResponse;
  /** Whether the service should report as healthy */
  healthy?: boolean;
  /** Simulate latency in milliseconds */
  latencyMs?: number;
  /** Simulate failures for specific FENs */
  failureFens?: Set<string>;
}

/**
 * Default Maia prediction response
 */
export const DEFAULT_MAIA_PREDICTION: PredictResponse = {
  predictions: [
    { move: 'e4', probability: 0.35 },
    { move: 'd4', probability: 0.25 },
    { move: 'Nf3', probability: 0.15 },
  ],
};

/**
 * Create a mock Maia client that matches the MaiaClient interface
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createMockMaia(config: MockMaiaConfig = {}) {
  const {
    responses = new Map(),
    defaultPrediction: _defaultPrediction = DEFAULT_MAIA_PREDICTION,
    healthy = true,
    latencyMs = 0,
    failureFens = new Set(),
  } = config;

  const predict = vi.fn(async (fen: string, _ratingBand?: number): Promise<PredictResponse> => {
    if (latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, latencyMs));
    }

    if (failureFens.has(fen)) {
      throw new Error(`Maia prediction failed for position: ${fen}`);
    }

    const cached = responses.get(fen);
    if (cached) {
      return cached;
    }

    // Generate a deterministic prediction based on FEN hash
    const hash = simpleHash(fen);
    const moves = ['e4', 'd4', 'Nf3', 'c4', 'e3', 'd3', 'g3', 'b3'];
    const primaryMove = moves[hash % moves.length]!;

    return {
      predictions: [
        { move: primaryMove, probability: 0.3 + (hash % 20) / 100 },
        { move: moves[(hash + 1) % moves.length]!, probability: 0.2 + (hash % 10) / 100 },
        { move: moves[(hash + 2) % moves.length]!, probability: 0.1 + (hash % 5) / 100 },
      ],
    };
  });

  const estimateRating = vi.fn(
    async (
      _moves: Array<{ fen: string; playedMove: string }>,
    ): Promise<EstimateRatingResponse> => {
      // Return a mock rating estimate
      return {
        estimatedRating: 1500,
        confidenceLow: 1400,
        confidenceHigh: 1600,
      };
    },
  );

  const healthCheck = vi.fn(async () => ({
    healthy,
    models: ['maia-1100', 'maia-1500', 'maia-1900'],
    activeModel: 'maia-1500',
  }));

  return {
    predict,
    estimateRating,
    healthCheck,
    // For test inspection
    _config: config,
    _calls: {
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      predict: () => predict.mock.calls,
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      estimateRating: () => estimateRating.mock.calls,
    },
  };
}

/**
 * Simple hash function for deterministic variation
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export type MockMaia = ReturnType<typeof createMockMaia>;
