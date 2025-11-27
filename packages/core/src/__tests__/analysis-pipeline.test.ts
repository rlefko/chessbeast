import { describe, it, expect, vi } from 'vitest';

import {
  AnalysisPipeline,
  createAnalysisPipeline,
  type EngineService,
  type MaiaService,
  type ParsedGameInput,
} from '../pipeline/analysis-pipeline.js';
import type { EngineEvaluation } from '../types/analysis.js';

describe('Analysis Pipeline', () => {
  // Mock engine service that returns static evaluations
  function createMockEngine(evalSequence?: EngineEvaluation[]): EngineService {
    let callCount = 0;
    const defaultEval: EngineEvaluation = { cp: 0, depth: 14, pv: ['e4'] };

    return {
      evaluate: vi.fn(async (_fen: string, _depth: number): Promise<EngineEvaluation> => {
        if (evalSequence && callCount < evalSequence.length) {
          const result = evalSequence[callCount]!;
          callCount++;
          return result;
        }
        return defaultEval;
      }),
      evaluateMultiPv: vi.fn(
        async (_fen: string, _depth: number, numLines: number): Promise<EngineEvaluation[]> => {
          const results: EngineEvaluation[] = [];
          for (let i = 0; i < numLines; i++) {
            if (evalSequence && callCount < evalSequence.length) {
              results.push(evalSequence[callCount]!);
              callCount++;
            } else {
              results.push({ ...defaultEval, cp: i * 10, pv: [`move${i}`] });
            }
          }
          return results;
        },
      ),
    };
  }

  // Mock Maia service
  function createMockMaia(): MaiaService {
    return {
      predictMoves: vi.fn(async () => [
        { san: 'e4', probability: 0.3 },
        { san: 'd4', probability: 0.25 },
      ]),
      estimateRating: vi.fn(async () => ({ rating: 1500, confidence: 0.8 })),
    };
  }

  // Simple test game
  const simpleGame: ParsedGameInput = {
    metadata: {
      white: 'Alice',
      black: 'Bob',
      result: '1-0',
    },
    moves: [
      {
        san: 'e4',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        moveNumber: 1,
        isWhiteMove: true,
      },
      {
        san: 'e5',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        fenAfter: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
        moveNumber: 1,
        isWhiteMove: false,
      },
      {
        san: 'Nf3',
        fenBefore: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
        fenAfter: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
        moveNumber: 2,
        isWhiteMove: true,
      },
      {
        san: 'Nc6',
        fenBefore: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
        fenAfter: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
        moveNumber: 2,
        isWhiteMove: false,
      },
    ],
  };

  describe('AnalysisPipeline', () => {
    it('should construct with just engine service', () => {
      const engine = createMockEngine();
      const pipeline = new AnalysisPipeline(engine);
      expect(pipeline).toBeDefined();
    });

    it('should construct with engine and maia services', () => {
      const engine = createMockEngine();
      const maia = createMockMaia();
      const pipeline = new AnalysisPipeline(engine, maia);
      expect(pipeline).toBeDefined();
    });

    it('should analyze a simple game', async () => {
      const engine = createMockEngine();
      const pipeline = new AnalysisPipeline(engine);

      const result = await pipeline.analyze(simpleGame);

      expect(result.metadata.white).toBe('Alice');
      expect(result.metadata.black).toBe('Bob');
      expect(result.metadata.result).toBe('1-0');
      expect(result.moves.length).toBe(4);
      expect(result.stats.totalPlies).toBe(4);
    });

    it('should classify moves', async () => {
      const engine = createMockEngine();
      const pipeline = new AnalysisPipeline(engine);

      const result = await pipeline.analyze(simpleGame);

      // All moves should have a classification
      for (const move of result.moves) {
        expect(move.classification).toBeDefined();
        expect([
          'book',
          'excellent',
          'good',
          'inaccuracy',
          'mistake',
          'blunder',
          'brilliant',
          'forced',
        ]).toContain(move.classification);
      }
    });

    it('should detect critical moments', async () => {
      // Create evaluations that include a "blunder"
      const evals: EngineEvaluation[] = [
        { cp: 0, depth: 14, pv: ['e4'] }, // Before e4
        { cp: 0, depth: 14, pv: ['e5'] }, // After e4
        { cp: 0, depth: 14, pv: ['e5'] }, // Before e5
        { cp: 0, depth: 14, pv: ['Nf3'] }, // After e5
        { cp: 0, depth: 14, pv: ['Nf3'] }, // Before Nf3
        { cp: 0, depth: 14, pv: ['Nc6'] }, // After Nf3
        { cp: 0, depth: 14, pv: ['Nc6'] }, // Before Nc6
        { cp: 500, depth: 14, pv: ['Bb5'] }, // After Nc6 - sudden advantage!
      ];

      const engine = createMockEngine(evals);
      const pipeline = new AnalysisPipeline(engine);

      const result = await pipeline.analyze(simpleGame);

      // Should have some critical moments detected
      expect(result.criticalMoments).toBeDefined();
      expect(Array.isArray(result.criticalMoments)).toBe(true);
    });

    it('should calculate player statistics', async () => {
      const engine = createMockEngine();
      const pipeline = new AnalysisPipeline(engine);

      const result = await pipeline.analyze(simpleGame);

      expect(result.stats.white).toBeDefined();
      expect(result.stats.black).toBeDefined();
      expect(result.stats.white.averageCpLoss).toBeDefined();
      expect(result.stats.white.accuracy).toBeDefined();
      expect(result.stats.black.averageCpLoss).toBeDefined();
      expect(result.stats.black.accuracy).toBeDefined();
    });

    it('should use Maia service when provided', async () => {
      const engine = createMockEngine();
      const maia = createMockMaia();
      const pipeline = new AnalysisPipeline(engine, maia, { skipMaia: false });

      await pipeline.analyze(simpleGame);

      // Maia should have been called
      expect(maia.predictMoves).toHaveBeenCalled();
    });

    it('should skip Maia when skipMaia is true', async () => {
      const engine = createMockEngine();
      const maia = createMockMaia();
      const pipeline = new AnalysisPipeline(engine, maia, { skipMaia: true });

      await pipeline.analyze(simpleGame);

      expect(maia.predictMoves).not.toHaveBeenCalled();
    });

    it('should report progress when callback provided', async () => {
      const engine = createMockEngine();
      const progressCallback = vi.fn();
      const pipeline = new AnalysisPipeline(engine, undefined, {}, progressCallback);

      await pipeline.analyze(simpleGame);

      expect(progressCallback).toHaveBeenCalled();
      // Should report at least shallow_analysis and complete
      const phases = progressCallback.mock.calls.map((call) => call[0]);
      expect(phases).toContain('shallow_analysis');
      expect(phases).toContain('complete');
    });

    it('should use custom rating config', async () => {
      const engine = createMockEngine();
      const pipeline = new AnalysisPipeline(engine, undefined, {
        whiteRating: 2000,
        blackRating: 1800,
      });

      const result = await pipeline.analyze(simpleGame);

      // Analysis should complete
      expect(result.moves.length).toBe(4);
    });
  });

  describe('createAnalysisPipeline', () => {
    it('should create a pipeline with factory function', () => {
      const engine = createMockEngine();
      const pipeline = createAnalysisPipeline(engine);
      expect(pipeline).toBeInstanceOf(AnalysisPipeline);
    });

    it('should pass all arguments to constructor', async () => {
      const engine = createMockEngine();
      const maia = createMockMaia();
      const progress = vi.fn();
      const pipeline = createAnalysisPipeline(engine, maia, { shallowDepth: 10 }, progress);

      await pipeline.analyze(simpleGame);

      expect(progress).toHaveBeenCalled();
    });
  });
});
