/**
 * Unit tests for EvaluationCache
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { EvaluationCache, type CachedEvaluation } from '../cache/evaluation-cache.js';

describe('EvaluationCache', () => {
  let cache: EvaluationCache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new EvaluationCache({ maxSize: 10, ttlMs: 60000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createEval = (overrides?: Partial<CachedEvaluation>): CachedEvaluation => ({
    cp: 50,
    mate: 0,
    depth: 18,
    bestLine: ['e2e4', 'e7e5'],
    multipv: 1,
    timestamp: Date.now(),
    ...overrides,
  });

  describe('FEN normalization', () => {
    it('should treat positions with different move counters as same', () => {
      const fen1 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
      const fen2 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 5 10';

      cache.set(fen1, createEval({ cp: 30 }));

      const result = cache.get(fen2, 18, 1);
      expect(result).toBeDefined();
      expect(result?.cp).toBe(30);
    });

    it('should treat positions with different piece placement as different', () => {
      const fen1 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
      const fen2 = 'rnbqkbnr/pppppppp/8/8/8/4P3/PPPP1PPP/RNBQKBNR w KQkq - 0 1';

      cache.set(fen1, createEval({ cp: 30 }));

      const result = cache.get(fen2, 18, 1);
      expect(result).toBeUndefined();
    });
  });

  describe('depth-aware caching', () => {
    it('should return cached result when cached depth >= requested depth', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      cache.set(fen, createEval({ depth: 20 }));

      // Request lower depth - should hit cache
      const result = cache.get(fen, 16, 1);
      expect(result).toBeDefined();
      expect(result?.depth).toBe(20);
    });

    it('should miss cache when requested depth > cached depth', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      cache.set(fen, createEval({ depth: 12 }));

      // Request higher depth - should miss cache
      const result = cache.get(fen, 18, 1);
      expect(result).toBeUndefined();
    });

    it('should return cached result when depths are equal', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      cache.set(fen, createEval({ depth: 18 }));

      const result = cache.get(fen, 18, 1);
      expect(result).toBeDefined();
    });
  });

  describe('multipv-aware caching', () => {
    it('should return cached result when cached multipv >= requested multipv', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      cache.set(fen, createEval({ multipv: 4 }));

      // Request fewer lines - should hit cache
      const result = cache.get(fen, 18, 2);
      expect(result).toBeDefined();
    });

    it('should miss cache when requested multipv > cached multipv', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      cache.set(fen, createEval({ multipv: 1 }));

      // Request more lines - should miss cache
      const result = cache.get(fen, 18, 3);
      expect(result).toBeUndefined();
    });
  });

  describe('cache update policy', () => {
    it('should not overwrite deeper evaluation with shallower one', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      cache.set(fen, createEval({ depth: 20, cp: 30 }));
      cache.set(fen, createEval({ depth: 12, cp: 50 }));

      const result = cache.get(fen, 12, 1);
      expect(result?.depth).toBe(20);
      expect(result?.cp).toBe(30); // Original value preserved
    });

    it('should overwrite shallower evaluation with deeper one', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      cache.set(fen, createEval({ depth: 12, cp: 50 }));
      cache.set(fen, createEval({ depth: 20, cp: 30 }));

      const result = cache.get(fen, 12, 1);
      expect(result?.depth).toBe(20);
      expect(result?.cp).toBe(30); // New value
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      cache.set(fen, createEval());

      // Advance time past TTL
      vi.advanceTimersByTime(61000);

      const result = cache.get(fen, 18, 1);
      expect(result).toBeUndefined();
    });

    it('should not expire entries before TTL', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      cache.set(fen, createEval());

      // Advance time but not past TTL
      vi.advanceTimersByTime(30000);

      const result = cache.get(fen, 18, 1);
      expect(result).toBeDefined();
    });
  });

  describe('LRU eviction', () => {
    it('should evict entries when at capacity', () => {
      // Create uniquely different positions (piece placement differs)
      const positions = [
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // starting
        'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', // 1.e4
        'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', // 1...e5
        'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2', // 2.Nf3
        'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', // 2...Nc6
        'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3', // 3.Bb5
        'r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', // 3...Nf6
        'r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4', // 4.O-O
        'r1bqk2r/pppp1ppp/2n2n2/1Bb1p3/4P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 6 5', // 4...Bc5
        'r1bqk2r/pppp1ppp/2n2n2/1Bb1p3/4P3/2N2N2/PPPP1PPP/R1BQ1RK1 b kq - 7 5', // 5.Nc3
      ];

      // Fill cache with 10 unique positions
      for (let i = 0; i < positions.length; i++) {
        cache.set(positions[i]!, createEval({ cp: i * 10 }));
      }

      // Should have 10 entries
      expect(cache.getStats().size).toBe(10);

      // Add 11th entry - should trigger eviction
      const newFen = 'r1bq1rk1/pppp1ppp/2n2n2/1Bb1p3/4P3/2N2N2/PPPP1PPP/R1BQ1RK1 w - - 8 6';
      cache.set(newFen, createEval({ cp: 999 }));

      // Should still be at max capacity
      expect(cache.getStats().size).toBe(10);

      // New entry should exist
      expect(cache.get(newFen, 18, 1)).toBeDefined();
    });
  });

  describe('stats tracking', () => {
    it('should track hits and misses', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

      // Miss
      cache.get(fen, 18, 1);

      // Set and hit
      cache.set(fen, createEval());
      cache.get(fen, 18, 1);
      cache.get(fen, 16, 1);

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.667, 2);
    });

    it('should reset stats on clear', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      cache.set(fen, createEval());
      cache.get(fen, 18, 1);

      cache.clear();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(0);
    });
  });

  describe('alternatives handling', () => {
    it('should store and retrieve alternatives', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const evalWithAlts = createEval({
        multipv: 3,
        alternatives: [
          { cp: 40, mate: 0, bestLine: ['d2d4', 'd7d5'] },
          { cp: 35, mate: 0, bestLine: ['g1f3', 'g8f6'] },
        ],
      });

      cache.set(fen, evalWithAlts);

      const result = cache.get(fen, 18, 3);
      expect(result?.alternatives).toHaveLength(2);
      expect(result?.alternatives?.[0]?.cp).toBe(40);
    });
  });
});
