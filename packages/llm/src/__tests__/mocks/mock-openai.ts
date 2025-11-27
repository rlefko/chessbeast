/**
 * Mock OpenAI client for testing
 */

import { vi } from 'vitest';
import type { LLMConfig } from '../../config/llm-config.js';
import { DEFAULT_LLM_CONFIG } from '../../config/llm-config.js';

/**
 * Create a mock OpenAI module
 */
export function createMockOpenAI(responses?: Map<string, string>) {
  const defaultResponse = JSON.stringify({
    comment: 'Mock annotation for testing',
    nags: ['$1'],
  });

  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn(async (request: { messages: Array<{ content: string }> }) => {
            const key = request.messages[request.messages.length - 1]?.content ?? '';
            const content = responses?.get(key) ?? defaultResponse;

            return {
              choices: [
                {
                  message: { content },
                  finish_reason: 'stop',
                },
              ],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 50,
                total_tokens: 150,
              },
            };
          }),
        },
      },
    })),
    APIError: class APIError extends Error {
      status: number;
      headers: Record<string, string>;
      constructor(status: number, message: string) {
        super(message);
        this.status = status;
        this.headers = {};
      }
    },
  };
}

/**
 * Create a mock config for testing
 */
export function createMockConfig(overrides?: Partial<LLMConfig>): LLMConfig {
  return {
    ...DEFAULT_LLM_CONFIG,
    apiKey: 'test-api-key',
    ...overrides,
  } as LLMConfig;
}

/**
 * Create mock game analysis for testing
 */
export function createMockGameAnalysis() {
  return {
    metadata: {
      white: 'Player1',
      black: 'Player2',
      result: '1-0',
      event: 'Test Game',
      whiteElo: 1500,
      blackElo: 1500,
      openingName: 'Sicilian Defense',
      eco: 'B20',
    },
    moves: [
      {
        plyIndex: 0,
        moveNumber: 1,
        isWhiteMove: true,
        san: 'e4',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        evalBefore: { cp: 0, depth: 20, pv: [] },
        evalAfter: { cp: 30, depth: 20, pv: [] },
        bestMove: 'e4',
        cpLoss: 0,
        classification: 'book' as const,
        isCriticalMoment: false,
      },
      {
        plyIndex: 1,
        moveNumber: 1,
        isWhiteMove: false,
        san: 'c5',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        fenAfter: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2',
        evalBefore: { cp: 30, depth: 20, pv: [] },
        evalAfter: { cp: 35, depth: 20, pv: [] },
        bestMove: 'c5',
        cpLoss: 0,
        classification: 'book' as const,
        isCriticalMoment: false,
      },
      {
        plyIndex: 10,
        moveNumber: 6,
        isWhiteMove: true,
        san: 'Bxf7',
        fenBefore: 'r1bqkb1r/pp2pppp/2np1n2/8/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 6',
        fenAfter: 'r1bqkb1r/pp2pBpp/2np1n2/8/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 6',
        evalBefore: { cp: 50, depth: 20, pv: [] },
        evalAfter: { cp: -150, depth: 20, pv: [] },
        bestMove: 'O-O',
        cpLoss: 200,
        classification: 'mistake' as const,
        humanProbability: 0.05,
        isCriticalMoment: true,
      },
    ],
    criticalMoments: [
      {
        plyIndex: 10,
        type: 'tactical_moment' as const,
        score: 75,
        reason: 'Premature sacrifice leads to material loss',
      },
    ],
    stats: {
      totalMoves: 30,
      totalPlies: 60,
      white: {
        averageCpLoss: 25,
        inaccuracies: 2,
        mistakes: 1,
        blunders: 0,
        excellentMoves: 5,
        brilliantMoves: 0,
        accuracy: 85,
      },
      black: {
        averageCpLoss: 30,
        inaccuracies: 3,
        mistakes: 0,
        blunders: 1,
        excellentMoves: 3,
        brilliantMoves: 1,
        accuracy: 80,
      },
      phaseTransitions: [
        { toPly: 0, phase: 'opening' as const },
        { toPly: 15, phase: 'middlegame' as const },
      ],
    },
  };
}
