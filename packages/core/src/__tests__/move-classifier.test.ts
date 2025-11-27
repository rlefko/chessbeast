import { describe, it, expect } from 'vitest';

import {
  normalizeEval,
  calculateCpLoss,
  classifyMove,
  classificationToNag,
  calculateAccuracy,
  isForcedMove,
  isBrilliantMove,
} from '../classifier/move-classifier.js';
import type { EngineEvaluation } from '../types/analysis.js';

describe('Move Classifier', () => {
  describe('normalizeEval', () => {
    // Note: normalizeEval now treats input as side-to-move perspective
    // The isWhiteToMove parameter is kept for API compatibility but not used

    it('should keep cp value unchanged (side-to-move perspective)', () => {
      const eval_: EngineEvaluation = { cp: 50, depth: 20, pv: ['e4'] };
      // Input is already from side-to-move perspective, should be unchanged
      expect(normalizeEval(eval_, true).cp).toBe(50);
      expect(normalizeEval(eval_, false).cp).toBe(50);
    });

    it('should handle positive mate scores (side to move delivers mate)', () => {
      const eval_: EngineEvaluation = { mate: 3, depth: 20, pv: ['Qh7#'] };
      const normalized = normalizeEval(eval_, true);
      expect(normalized.isMate).toBe(true);
      expect(normalized.mateIn).toBe(3);
      expect(normalized.cp).toBeGreaterThan(10000);
    });

    it('should handle negative mate scores (side to move gets mated)', () => {
      const eval_: EngineEvaluation = { mate: -2, depth: 20, pv: ['Kg1'] };
      const normalized = normalizeEval(eval_, true);
      expect(normalized.isMate).toBe(true);
      expect(normalized.mateIn).toBe(2);
      expect(normalized.cp).toBeLessThan(-10000);
    });

    it('should default cp to 0 if undefined', () => {
      const eval_: EngineEvaluation = { depth: 10, pv: [] };
      const normalized = normalizeEval(eval_, true);
      expect(normalized.cp).toBe(0);
    });
  });

  describe('calculateCpLoss', () => {
    // Note: Stockfish returns evaluations from side-to-move perspective:
    // - evalBefore.cp: From moving player's perspective (positive = good for them)
    // - evalAfter.cp: From opponent's perspective (positive = good for opponent)

    describe('side-to-move perspective handling', () => {
      it('should return 0 for a neutral move when White plays', () => {
        // White plays, position stays +200 for White
        // Before: White to move, +200 (White is better)
        // After: Black to move, -200 (Black is worse, i.e. White is still +200)
        const evalBefore: EngineEvaluation = { cp: 200, depth: 20, pv: ['e4'] };
        const evalAfter: EngineEvaluation = { cp: -200, depth: 20, pv: ['e5'] };
        expect(calculateCpLoss(evalBefore, evalAfter, true)).toBe(0);
      });

      it('should return 0 for a neutral move when Black plays', () => {
        // Black plays, position stays +200 for White (Black is -200)
        // Before: Black to move, -200 (Black is worse)
        // After: White to move, +200 (White is better)
        const evalBefore: EngineEvaluation = { cp: -200, depth: 20, pv: ['e5'] };
        const evalAfter: EngineEvaluation = { cp: 200, depth: 20, pv: ['Nf3'] };
        expect(calculateCpLoss(evalBefore, evalAfter, false)).toBe(0);
      });

      it('should detect cp loss when White blunders', () => {
        // White blunders, goes from +200 to -100 (from White's consistent perspective)
        // Before: White to move, +200 (White is better)
        // After: Black to move, +100 (Black is now +100, so White is -100)
        const evalBefore: EngineEvaluation = { cp: 200, depth: 20, pv: ['e4'] };
        const evalAfter: EngineEvaluation = { cp: 100, depth: 20, pv: ['e5'] };
        expect(calculateCpLoss(evalBefore, evalAfter, true)).toBe(300);
      });

      it('should detect cp loss when Black blunders', () => {
        // Black blunders, goes from equal to -300 (from Black's perspective)
        // Before: Black to move, 0 (equal)
        // After: White to move, +300 (White is now +300, so Black is -300)
        const evalBefore: EngineEvaluation = { cp: 0, depth: 20, pv: ['e5'] };
        const evalAfter: EngineEvaluation = { cp: 300, depth: 20, pv: ['Nf3'] };
        expect(calculateCpLoss(evalBefore, evalAfter, false)).toBe(300);
      });
    });

    it('should return 0 for perfect move (maintained advantage)', () => {
      // White plays, stays +50
      const evalBefore: EngineEvaluation = { cp: 50, depth: 20, pv: ['e4'] };
      const evalAfter: EngineEvaluation = { cp: -50, depth: 20, pv: ['e5'] };
      const cpLoss = calculateCpLoss(evalBefore, evalAfter, true);
      expect(cpLoss).toBe(0);
    });

    it('should calculate positive cpLoss when position worsens', () => {
      // White plays, goes from +50 to -100 (lost 150 cp)
      // Before: White +50, After: Black +100 (White is -100)
      const evalBefore: EngineEvaluation = { cp: 50, depth: 20, pv: ['e4'] };
      const evalAfter: EngineEvaluation = { cp: 100, depth: 20, pv: ['e5'] };
      const cpLoss = calculateCpLoss(evalBefore, evalAfter, true);
      expect(cpLoss).toBe(150);
    });

    it('should handle black moves correctly', () => {
      // Black plays, goes from -50 (Black worse) to White +100 (Black even more worse)
      // cpLoss = 50 cp lost from Black's perspective
      const evalBefore: EngineEvaluation = { cp: -50, depth: 20, pv: ['e5'] };
      const evalAfter: EngineEvaluation = { cp: 100, depth: 20, pv: ['Nf3'] };
      const cpLoss = calculateCpLoss(evalBefore, evalAfter, false);
      expect(cpLoss).toBe(50);
    });

    it('should never return negative cpLoss even when position improves', () => {
      // White plays, improves from +50 to +100
      // Before: White +50, After: Black -100 (White is +100)
      const evalBefore: EngineEvaluation = { cp: 50, depth: 20, pv: ['e4'] };
      const evalAfter: EngineEvaluation = { cp: -100, depth: 20, pv: ['e5'] };
      const cpLoss = calculateCpLoss(evalBefore, evalAfter, true);
      expect(cpLoss).toBe(0);
    });
  });

  describe('classifyMove', () => {
    // Note: All evaluations are from side-to-move perspective
    const goodPosition: EngineEvaluation = { cp: 50, depth: 20, pv: ['e4'] };

    it('should classify book moves as book', () => {
      // After a neutral move: +50 for White -> Black sees -50
      const afterNeutral: EngineEvaluation = { cp: -50, depth: 20, pv: ['e5'] };
      const result = classifyMove(goodPosition, afterNeutral, true, { isBookMove: true });
      expect(result.classification).toBe('book');
    });

    it('should classify low cpLoss as excellent', () => {
      // White plays, stays around +50 (loses only 2 cp)
      // Before: White +50, After: Black -48 (White is +48)
      const after: EngineEvaluation = { cp: -48, depth: 20, pv: ['e5'] };
      const result = classifyMove(goodPosition, after, true, { rating: 1500 });
      expect(result.classification).toBe('excellent');
      expect(result.cpLoss).toBeLessThanOrEqual(10);
    });

    it('should classify high cpLoss as blunder at intermediate level', () => {
      // White plays, goes from +50 to -250 (lost 300 cp)
      // Before: White +50, After: Black +250 (White is -250)
      const after: EngineEvaluation = { cp: 250, depth: 20, pv: ['e5'] };
      const result = classifyMove(goodPosition, after, true, { rating: 1300 });
      expect(result.classification).toBe('blunder');
    });

    it('should be more lenient for beginners', () => {
      // White plays, goes from +50 to -200 (lost 250 cp)
      // Before: White +50, After: Black +200 (White is -200)
      const after: EngineEvaluation = { cp: 200, depth: 20, pv: ['e5'] };
      const result = classifyMove(goodPosition, after, true, { rating: 800 });
      // At 800 rating, 250 cp loss is just a mistake, not a blunder (threshold is 500)
      expect(result.classification).not.toBe('blunder');
    });

    it('should be stricter for masters', () => {
      // White plays, goes from +50 to -50 (lost 100 cp)
      // Before: White +50, After: Black +50 (White is -50)
      const after: EngineEvaluation = { cp: 50, depth: 20, pv: ['e5'] };
      const result = classifyMove(goodPosition, after, true, { rating: 2300 });
      // At 2300 rating, 100 cp loss is a mistake/inaccuracy
      expect(['inaccuracy', 'mistake', 'blunder']).toContain(result.classification);
    });
  });

  describe('isForcedMove', () => {
    it('should return true for single legal move', () => {
      expect(isForcedMove(0, 1)).toBe(true);
    });

    it('should return true for two legal moves', () => {
      expect(isForcedMove(0, 2)).toBe(true);
    });

    it('should return false for many legal moves', () => {
      expect(isForcedMove(0, 30)).toBe(false);
    });

    it('should return true if alternatives are much worse', () => {
      expect(isForcedMove(0, 10, [{ cpLoss: 150 }, { cpLoss: 200 }])).toBe(true);
    });
  });

  describe('isBrilliantMove', () => {
    it('should return false for high cpLoss', () => {
      expect(isBrilliantMove(100)).toBe(false);
    });

    it('should return false for common moves (high human probability)', () => {
      expect(isBrilliantMove(0, 0.8)).toBe(false);
    });

    it('should return true for surprising sacrifices', () => {
      expect(isBrilliantMove(5, 0.1, true)).toBe(true);
    });

    it('should return true for very surprising good moves', () => {
      expect(isBrilliantMove(5, 0.05)).toBe(true);
    });
  });

  describe('classificationToNag', () => {
    it('should return $1 for excellent', () => {
      expect(classificationToNag('excellent')).toBe('$1');
    });

    it('should return $3 for brilliant', () => {
      expect(classificationToNag('brilliant')).toBe('$3');
    });

    it('should return $2 for mistake', () => {
      expect(classificationToNag('mistake')).toBe('$2');
    });

    it('should return $4 for blunder', () => {
      expect(classificationToNag('blunder')).toBe('$4');
    });

    it('should return $6 for inaccuracy', () => {
      expect(classificationToNag('inaccuracy')).toBe('$6');
    });

    it('should return undefined for good moves', () => {
      expect(classificationToNag('good')).toBeUndefined();
    });
  });

  describe('calculateAccuracy', () => {
    it('should return 100 for empty array', () => {
      expect(calculateAccuracy([])).toBe(100);
    });

    it('should return 100 for all perfect moves', () => {
      expect(calculateAccuracy([0, 0, 0])).toBe(100);
    });

    it('should return lower accuracy for high cpLoss', () => {
      const accuracy = calculateAccuracy([100, 100, 100]);
      expect(accuracy).toBeLessThan(100);
      expect(accuracy).toBeGreaterThan(0);
    });

    it('should have accuracy proportional to cpLoss', () => {
      const lowLoss = calculateAccuracy([10, 10, 10]);
      const highLoss = calculateAccuracy([200, 200, 200]);
      expect(lowLoss).toBeGreaterThan(highLoss);
    });
  });
});
