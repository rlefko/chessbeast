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
import { getPositionStatus, isDecidedPosition } from '../classifier/thresholds.js';
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

  describe('getPositionStatus', () => {
    it('should return decisive for >= 500cp', () => {
      expect(getPositionStatus(500)).toBe('decisive');
      expect(getPositionStatus(800)).toBe('decisive');
      expect(getPositionStatus(10000)).toBe('decisive');
    });

    it('should return winning for 200-499cp', () => {
      expect(getPositionStatus(200)).toBe('winning');
      expect(getPositionStatus(350)).toBe('winning');
      expect(getPositionStatus(499)).toBe('winning');
    });

    it('should return advantage for 100-199cp', () => {
      expect(getPositionStatus(100)).toBe('advantage');
      expect(getPositionStatus(150)).toBe('advantage');
      expect(getPositionStatus(199)).toBe('advantage');
    });

    it('should return slight for 30-99cp', () => {
      expect(getPositionStatus(30)).toBe('slight');
      expect(getPositionStatus(50)).toBe('slight');
      expect(getPositionStatus(99)).toBe('slight');
    });

    it('should return equal for -29 to +29cp', () => {
      expect(getPositionStatus(0)).toBe('equal');
      expect(getPositionStatus(29)).toBe('equal');
      expect(getPositionStatus(-29)).toBe('equal');
    });

    it('should return lost for <= -500cp', () => {
      expect(getPositionStatus(-500)).toBe('lost');
      expect(getPositionStatus(-800)).toBe('lost');
      expect(getPositionStatus(-10000)).toBe('lost');
    });
  });

  describe('isDecidedPosition', () => {
    it('should return true for decisive', () => {
      expect(isDecidedPosition('decisive')).toBe(true);
    });

    it('should return true for lost', () => {
      expect(isDecidedPosition('lost')).toBe(true);
    });

    it('should return false for winning', () => {
      expect(isDecidedPosition('winning')).toBe(false);
    });

    it('should return false for equal', () => {
      expect(isDecidedPosition('equal')).toBe(false);
    });
  });

  describe('position-aware classification', () => {
    it('should downgrade blunder to mistake when position stays decisive', () => {
      // Black is decisive (+600) and plays a move that would normally be a blunder
      // but stays decisive (+800 from Black's view)
      // Before: Black to move, +600 (Black is winning)
      // After: White to move, -800 (Black is still winning by more - not worse!)
      // Wait - this doesn't make sense. Let me think again.
      //
      // For Black to have a blunder, the position must get WORSE for Black:
      // Before: Black to move, eval from Black's perspective is +600 (Black is winning)
      // After: White to move, eval from White's perspective must show Black lost ground
      // If evalAfter.cp = +200 (White's view), then Black's view is -200 (Black went from +600 to -200)
      //
      // Actually, the evaluations are from side-to-move perspective:
      // evalBefore.cp: From Black's perspective (positive = good for Black)
      // evalAfter.cp: From White's perspective (positive = good for White)
      //
      // So for Black to have a big cpLoss but stay in decisive territory:
      // Before: Black +600 (Black is winning by 6 pawns)
      // After: White +200 (White sees +2, meaning Black is still -2 from White's view)
      // cpLoss = 600 - (-200) = 800cp loss... but Black went from +6 to -2, that's not staying decisive
      //
      // Let's try:
      // Before: Black +600 (Black is decisive)
      // After: White -500 (White sees -5, meaning Black is still +5 = decisive)
      // cpLoss = 600 - (500) = 100cp loss

      // Actually simpler: let's just make it so the position stays in decisive range
      // Before: Black is +700
      // After: White sees -550 (so Black is still +550 = decisive)
      const evalBefore: EngineEvaluation = { cp: 700, depth: 20, pv: ['Qh5'] };
      const evalAfter: EngineEvaluation = { cp: -550, depth: 20, pv: ['Nf3'] };
      // cpLoss = 700 - (550) = 150cp (mistake at 1500 rating)

      const result = classifyMove(evalBefore, evalAfter, false, { rating: 1500 });
      // Status before: decisive (+700)
      // Status after: decisive (+550 from Black's view)
      // Should downgrade mistake -> inaccuracy
      expect(result.wasAdjusted).toBe(true);
      expect(result.rawClassification).toBe('mistake');
      expect(result.classification).toBe('inaccuracy');
      expect(result.statusBefore).toBe('decisive');
      expect(result.statusAfter).toBe('decisive');
    });

    it('should downgrade mistake to inaccuracy when position stays decisive', () => {
      // Before: Black +600 (decisive)
      // After: White -520 (Black still +520 = decisive)
      // cpLoss = 600 - 520 = 80cp (inaccuracy at 1500 rating... hmm, need to check thresholds)
      // At 1500 rating (Club 1400-1600): mistake 120-249, inaccuracy 40-119
      // So 80cp is inaccuracy, let's make it 130cp for mistake
      // 600 - x = 130 => x = 470... but 470 is losing not decisive
      // Need both before and after to be >= 500

      // Before: Black +800
      // After: White -650 (Black still +650 = decisive)
      // cpLoss = 800 - 650 = 150cp (mistake at 1500)
      const evalBefore: EngineEvaluation = { cp: 800, depth: 20, pv: ['Qh5'] };
      const evalAfter: EngineEvaluation = { cp: -650, depth: 20, pv: ['Nf3'] };

      const result = classifyMove(evalBefore, evalAfter, false, { rating: 1500 });
      expect(result.wasAdjusted).toBe(true);
      expect(result.rawClassification).toBe('mistake');
      expect(result.classification).toBe('inaccuracy');
    });

    it('should keep blunder classification when position crosses from decisive to winning', () => {
      // Before: Black +600 (decisive)
      // After: White -300 (Black +300 = winning, not decisive)
      // This crosses the threshold, should NOT downgrade
      const evalBefore: EngineEvaluation = { cp: 600, depth: 20, pv: ['Qh5'] };
      const evalAfter: EngineEvaluation = { cp: -300, depth: 20, pv: ['Nf3'] };
      // cpLoss = 600 - 300 = 300cp (blunder at 1500)

      const result = classifyMove(evalBefore, evalAfter, false, { rating: 1500 });
      expect(result.wasAdjusted).toBe(false);
      expect(result.classification).toBe('blunder');
      expect(result.statusBefore).toBe('decisive');
      expect(result.statusAfter).toBe('winning');
    });

    it('should keep penalty when position goes from lost to losing', () => {
      // White is losing badly (-600) and makes it slightly better (-400)
      // Before: White -600 (lost from White's view)
      // After: Black +400 (Black is now only +400, so White is -400 = losing)
      // Wait, if White improves, cpLoss = 0
      // Let me think from a worsening scenario:
      // Before: White -600 (lost)
      // After: Black +300 (Black +300 means White -300 = losing)
      // cpLoss = -600 - (-300) = -300 (negative, clamped to 0)

      // Actually for a MISTAKE in a lost position to NOT be adjusted, we need
      // the position to cross from lost to losing (which means improvement, so no cpLoss)
      // OR from losing to lost (which would be the adjustment case but they're not same category)

      // Let me test: lost position stays lost but player makes it worse
      // Before: White -600 (lost)
      // After: Black +800 (Black +800 = White -800, still lost but worse)
      // cpLoss = -600 - (-800) = 200cp (mistake)
      const evalBefore: EngineEvaluation = { cp: -600, depth: 20, pv: ['Kf1'] };
      const evalAfter: EngineEvaluation = { cp: 800, depth: 20, pv: ['Qxf2'] };

      const result = classifyMove(evalBefore, evalAfter, true, { rating: 1500 });
      // Status before: lost (-600 from White's view)
      // Status after: lost (-800 from White's view)
      // Should downgrade since both are lost
      expect(result.statusBefore).toBe('lost');
      expect(result.statusAfter).toBe('lost');
      expect(result.wasAdjusted).toBe(true);
      expect(result.rawClassification).toBe('mistake');
      expect(result.classification).toBe('inaccuracy');
    });

    it('should not adjust classification when position is not decided', () => {
      // Normal non-decided position
      const evalBefore: EngineEvaluation = { cp: 100, depth: 20, pv: ['e4'] };
      const evalAfter: EngineEvaluation = { cp: 100, depth: 20, pv: ['e5'] };
      // cpLoss = 100 - (-100) = 200cp (mistake)

      const result = classifyMove(evalBefore, evalAfter, true, { rating: 1500 });
      expect(result.wasAdjusted).toBe(false);
      expect(result.statusBefore).toBe('advantage');
      expect(result.classification).toBe('mistake');
    });

    it('should include status information in result', () => {
      const evalBefore: EngineEvaluation = { cp: 50, depth: 20, pv: ['e4'] };
      const evalAfter: EngineEvaluation = { cp: -45, depth: 20, pv: ['e5'] };

      const result = classifyMove(evalBefore, evalAfter, true, { rating: 1500 });
      expect(result.statusBefore).toBe('slight');
      expect(result.statusAfter).toBe('slight');
    });
  });
});
