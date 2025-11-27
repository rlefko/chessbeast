/**
 * Combined mock services factory for integration testing
 */

import { vi } from 'vitest';

import {
  createMockEngine,
  type MockEngineConfig,
  type MockEngine,
  type EvaluateResponse,
} from './mock-engine.js';
import { createMockAnnotator, type MockLlmConfig, type MockAnnotator } from './mock-llm.js';
import {
  createMockMaia,
  type MockMaiaConfig,
  type MockMaia,
  type PredictResponse,
} from './mock-maia.js';

/**
 * Configuration for all mock services
 */
export interface MockServicesConfig {
  engine?: MockEngineConfig;
  maia?: MockMaiaConfig;
  llm?: MockLlmConfig;
  /** Skip Maia service entirely */
  skipMaia?: boolean;
  /** Skip LLM service entirely */
  skipLlm?: boolean;
  /** Skip database clients */
  skipDatabases?: boolean;
}

/**
 * Mock ECO client
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createMockEcoClient() {
  const lookupByFen = vi.fn((fen: string) => {
    // Return a mock opening based on common starting positions
    if (fen.includes('rnbqkbnr/pppppppp')) {
      return null; // Starting position
    }
    if (fen.includes('e4')) {
      return {
        eco: 'B00',
        name: "King's Pawn Opening",
        variation: null,
      };
    }
    if (fen.includes('d4')) {
      return {
        eco: 'A40',
        name: "Queen's Pawn Opening",
        variation: null,
      };
    }
    return null;
  });

  const lookupByMoves = vi.fn((moves: string[]) => {
    if (moves.length === 0) return null;
    if (moves[0] === 'e4') {
      if (moves[1] === 'e5') {
        return { eco: 'C20', name: "King's Pawn Game", variation: null };
      }
      if (moves[1] === 'c5') {
        return { eco: 'B20', name: 'Sicilian Defense', variation: null };
      }
    }
    if (moves[0] === 'd4') {
      if (moves[1] === 'd5') {
        return { eco: 'D00', name: "Queen's Pawn Game", variation: null };
      }
      if (moves[1] === 'Nf6') {
        return { eco: 'A45', name: 'Indian Defense', variation: null };
      }
    }
    return { eco: 'A00', name: 'Uncommon Opening', variation: null };
  });

  const getOpeningByMoves = vi.fn((movesUci: string[]) => {
    if (movesUci.length === 0) {
      return {
        matchedPlies: 0,
        isExactMatch: false,
      };
    }

    // Return a mock opening lookup result
    return {
      opening: {
        eco: 'B00',
        name: "King's Pawn Opening",
        mainLine: ['e4'],
        movesUci: 'e2e4',
        epd: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -',
        numPlies: 1,
      },
      matchedPlies: Math.min(movesUci.length, 2),
      isExactMatch: false,
    };
  });

  const close = vi.fn();

  return {
    lookupByFen,
    lookupByMoves,
    getOpeningByMoves,
    close,
  };
}

/**
 * Mock Lichess Elite client
 * Implements the LichessEliteClient interface used by the adapter
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createMockLichessClient() {
  const getReferenceGames = vi.fn((_fen: string, _limit?: number) => {
    // Return empty result for most positions
    // Could be enhanced to return actual reference games for specific test FENs
    return {
      games: [],
      totalCount: 0,
    };
  });

  const getGameStats = vi.fn((_fen: string) => {
    return {
      totalGames: 0,
      whiteWins: 0,
      blackWins: 0,
      draws: 0,
    };
  });

  const close = vi.fn();

  return {
    getReferenceGames,
    getGameStats,
    close,
  };
}

/**
 * Mock progress reporter that does nothing
 *
 * Returns `any` to be compatible with ProgressReporter interface.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createNullReporter(): any {
  return {
    startPhase: vi.fn(),
    completePhase: vi.fn(),
    failPhase: vi.fn(),
    startGame: vi.fn(),
    completeGame: vi.fn(),
    updateProgress: vi.fn(),
    reportServiceStatus: vi.fn(),
  };
}

/**
 * Mock progress reporter that tracks all calls
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTrackingReporter(): any {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  const track =
    (method: string): ((...args: unknown[]) => void) =>
    (...args: unknown[]): void => {
      calls.push({ method, args });
    };

  return {
    startPhase: vi.fn(track('startPhase')),
    completePhase: vi.fn(track('completePhase')),
    failPhase: vi.fn(track('failPhase')),
    startGame: vi.fn(track('startGame')),
    completeGame: vi.fn(track('completeGame')),
    updateProgress: vi.fn(track('updateProgress')),
    reportServiceStatus: vi.fn(track('reportServiceStatus')),
    // For test inspection
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    _getCalls: () => calls,
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    _reset: () => {
      calls.length = 0;
    },
  };
}

/**
 * Container for all mock services matching the Services interface
 */
export interface MockServices {
  stockfish: MockEngine;
  maia: MockMaia | null;
  ecoClient: ReturnType<typeof createMockEcoClient> | null;
  lichessClient: ReturnType<typeof createMockLichessClient> | null;
  annotator: MockAnnotator | null;
}

/**
 * Create all mock services for integration testing
 *
 * Returns `any` type to be compatible with orchestrateAnalysis's Services interface.
 * The mock services implement the methods needed by the orchestrator,
 * but not the full gRPC client interfaces.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMockServices(config: MockServicesConfig = {}): any {
  const { engine, maia, llm, skipMaia = false, skipLlm = false, skipDatabases = false } = config;

  const services: MockServices = {
    stockfish: createMockEngine(engine),
    maia: skipMaia ? null : createMockMaia(maia),
    ecoClient: skipDatabases ? null : createMockEcoClient(),
    lichessClient: skipDatabases ? null : createMockLichessClient(),
    annotator: skipLlm ? null : createMockAnnotator(llm),
  };

  return services;
}

/**
 * Create mock services with deterministic, fixed responses
 * Useful for golden tests where consistent output is needed
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDeterministicMocks(): any {
  // Fixed engine evaluations for consistency
  const engineResponses = new Map<string, EvaluateResponse>([
    // Starting position
    [
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      { cp: 25, mate: 0, depth: 20, bestLine: ['e2e4'], alternatives: [] },
    ],
    // After 1.e4
    [
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      { cp: 20, mate: 0, depth: 20, bestLine: ['e7e5'], alternatives: [] },
    ],
  ]);

  // Fixed Maia predictions
  const maiaResponses = new Map<string, PredictResponse>([
    [
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      {
        predictions: [
          { move: 'e4', probability: 0.35 },
          { move: 'd4', probability: 0.3 },
          { move: 'Nf3', probability: 0.15 },
        ],
      },
    ],
  ]);

  // Fixed annotations
  const annotations = new Map<string, string>([
    ['e4', 'The king pawn opening, controlling the center.'],
    ['d4', 'The queen pawn opening, a solid choice.'],
  ]);

  return createMockServices({
    engine: { responses: engineResponses },
    maia: { responses: maiaResponses },
    llm: { annotations },
  });
}

export type { MockEngine, MockMaia, MockAnnotator };
