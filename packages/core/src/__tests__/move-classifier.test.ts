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
    it('should keep positive cp for white to move', () => {
      const eval_: EngineEvaluation = { cp: 50, depth: 20, pv: ['e4'] };
      const normalized = normalizeEval(eval_, true);
      expect(normalized.cp).toBe(50);
      expect(normalized.isMate).toBe(false);
    });

    it('should flip cp sign for black to move', () => {
      const eval_: EngineEvaluation = { cp: 50, depth: 20, pv: ['e4'] };
      const normalized = normalizeEval(eval_, false);
      expect(normalized.cp).toBe(-50);
    });

    it('should handle mate scores for white to move', () => {
      const eval_: EngineEvaluation = { mate: 3, depth: 20, pv: ['Qh7#'] };
      const normalized = normalizeEval(eval_, true);
      expect(normalized.isMate).toBe(true);
      expect(normalized.mateIn).toBe(3);
      expect(normalized.cp).toBeGreaterThan(10000);
    });

    it('should handle getting mated for white to move', () => {
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
    it('should return 0 for perfect move (maintained advantage)', () => {
      // Before: +50 for white, After: +50 for white (from white's perspective)
      const evalBefore: EngineEvaluation = { cp: 50, depth: 20, pv: ['e4'] };
      const evalAfter: EngineEvaluation = { cp: 50, depth: 20, pv: ['e5'] };
      const cpLoss = calculateCpLoss(evalBefore, evalAfter, true);
      expect(cpLoss).toBe(0);
    });

    it('should calculate positive cpLoss when position worsens', () => {
      // Before: +50 for white, After: -100 for white (lost 150 cp)
      const evalBefore: EngineEvaluation = { cp: 50, depth: 20, pv: ['e4'] };
      const evalAfter: EngineEvaluation = { cp: -100, depth: 20, pv: ['e5'] };
      const cpLoss = calculateCpLoss(evalBefore, evalAfter, true);
      expect(cpLoss).toBeGreaterThan(0);
    });

    it('should handle black moves', () => {
      // Before: -50 (black is +50), After: +100 (white is +100, so black lost 150)
      const evalBefore: EngineEvaluation = { cp: -50, depth: 20, pv: ['e5'] };
      const evalAfter: EngineEvaluation = { cp: 100, depth: 20, pv: ['Nf3'] };
      const cpLoss = calculateCpLoss(evalBefore, evalAfter, false);
      expect(cpLoss).toBeGreaterThan(0);
    });

    it('should never return negative cpLoss even when position improves', () => {
      // Before: +50 for white, After: +100 for white (improved!)
      const evalBefore: EngineEvaluation = { cp: 50, depth: 20, pv: ['e4'] };
      const evalAfter: EngineEvaluation = { cp: 100, depth: 20, pv: ['e5'] };
      const cpLoss = calculateCpLoss(evalBefore, evalAfter, true);
      expect(cpLoss).toBe(0);
    });
  });

  describe('classifyMove', () => {
    const goodPosition: EngineEvaluation = { cp: 50, depth: 20, pv: ['e4'] };

    it('should classify book moves as book', () => {
      const result = classifyMove(goodPosition, goodPosition, true, { isBookMove: true });
      expect(result.classification).toBe('book');
    });

    it('should classify low cpLoss as excellent', () => {
      // Before: +50, After: +48 (only lost 2 cp)
      const after: EngineEvaluation = { cp: 48, depth: 20, pv: ['e5'] };
      const result = classifyMove(goodPosition, after, true, { rating: 1500 });
      expect(result.classification).toBe('excellent');
      expect(result.cpLoss).toBeLessThanOrEqual(10);
    });

    it('should classify high cpLoss as blunder at intermediate level', () => {
      // Before: +50, After: -250 (lost 300 cp)
      const after: EngineEvaluation = { cp: -250, depth: 20, pv: ['e5'] };
      const result = classifyMove(goodPosition, after, true, { rating: 1300 });
      expect(result.classification).toBe('blunder');
    });

    it('should be more lenient for beginners', () => {
      // Before: +50, After: -200 (lost 250 cp)
      const after: EngineEvaluation = { cp: -200, depth: 20, pv: ['e5'] };
      const result = classifyMove(goodPosition, after, true, { rating: 800 });
      // At 800 rating, 250 cp loss is just a mistake, not a blunder (threshold is 500)
      expect(result.classification).not.toBe('blunder');
    });

    it('should be stricter for masters', () => {
      // Before: +50, After: -50 (lost 100 cp)
      const after: EngineEvaluation = { cp: -50, depth: 20, pv: ['e5'] };
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
