/**
 * Mock Stockfish engine client for testing
 *
 * Implements the StockfishClient interface used by the adapter
 */

import { vi } from 'vitest';

/**
 * Evaluation response matching StockfishClient.evaluate() return type
 */
export interface EvaluateResponse {
  cp: number;
  mate: number;
  depth: number;
  bestLine: string[];
  alternatives: EvaluateResponse[];
}

export interface EvaluateOptions {
  depth?: number;
  timeLimitMs?: number;
  multipv?: number;
  nodes?: number;
}

export interface MockEngineConfig {
  /** Predefined responses for specific FEN positions */
  responses?: Map<string, EvaluateResponse>;
  /** Default evaluation to return when no match found */
  defaultEval?: Partial<EvaluateResponse>;
  /** Whether the service should report as healthy */
  healthy?: boolean;
  /** Simulate latency in milliseconds */
  latencyMs?: number;
  /** Simulate failures for specific FENs */
  failureFens?: Set<string>;
}

/**
 * Default engine evaluation response
 */
export const DEFAULT_ENGINE_EVAL: EvaluateResponse = {
  cp: 0,
  mate: 0,
  depth: 20,
  bestLine: ['e2e4'],
  alternatives: [],
};

/**
 * Create a mock Stockfish client that matches the StockfishClient interface
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createMockEngine(config: MockEngineConfig = {}) {
  const {
    responses = new Map(),
    defaultEval = DEFAULT_ENGINE_EVAL,
    healthy = true,
    latencyMs = 0,
    failureFens = new Set(),
  } = config;

  const evaluate = vi.fn(
    async (fen: string, options: EvaluateOptions = {}): Promise<EvaluateResponse> => {
      if (latencyMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, latencyMs));
      }

      if (failureFens.has(fen)) {
        throw new Error(`Engine evaluation failed for position: ${fen}`);
      }

      const cached = responses.get(fen);
      if (cached) {
        return cached;
      }

      // Generate a deterministic but varied evaluation based on FEN hash
      const hash = simpleHash(fen);
      const variation = (hash % 100) - 50; // -50 to +49

      const depth = options.depth ?? defaultEval.depth ?? 20;
      const multipv = options.multipv ?? 1;

      // Generate main evaluation
      const mainEval: EvaluateResponse = {
        cp: (defaultEval.cp ?? 0) + variation,
        mate: 0,
        depth,
        bestLine: defaultEval.bestLine ?? ['e2e4'],
        alternatives: [],
      };

      // Generate alternatives if multipv > 1
      if (multipv > 1) {
        for (let i = 1; i < multipv; i++) {
          mainEval.alternatives.push({
            cp: mainEval.cp - i * 30,
            mate: 0,
            depth,
            bestLine: [`alt${i}`],
            alternatives: [],
          });
        }
      }

      return mainEval;
    },
  );

  const healthCheck = vi.fn(async () => ({
    healthy,
    version: '16.0.0-mock',
  }));

  return {
    evaluate,
    healthCheck,
    // For test inspection
    _config: config,
    _calls: {
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      evaluate: () => evaluate.mock.calls,
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
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

export type MockEngine = ReturnType<typeof createMockEngine>;
