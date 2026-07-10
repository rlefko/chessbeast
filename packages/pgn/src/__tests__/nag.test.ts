/**
 * Tests for NAG (Numeric Annotation Glyph) utilities
 */

import { describe, it, expect } from 'vitest';

import {
  VALID_NAGS,
  MOVE_QUALITY_NAGS,
  POSITION_NAGS,
  isValidNag,
  normalizeNag,
  classificationToNag,
  filterValidNags,
  getNagDescription,
  getNagSymbol,
  evalToPositionNag,
  evalToVerbalDescription,
  type MoveClassification,
} from '../nag/index.js';

describe('NAG Utilities', () => {
  describe('VALID_NAGS', () => {
    it('should contain common move quality NAGs', () => {
      expect(VALID_NAGS.has('$1')).toBe(true); // !
      expect(VALID_NAGS.has('$2')).toBe(true); // ?
      expect(VALID_NAGS.has('$3')).toBe(true); // !!
      expect(VALID_NAGS.has('$4')).toBe(true); // ??
      expect(VALID_NAGS.has('$5')).toBe(true); // !?
      expect(VALID_NAGS.has('$6')).toBe(true); // ?!
      expect(VALID_NAGS.has('$7')).toBe(true); // forced move
    });

    it('should contain positional evaluation NAGs', () => {
      expect(VALID_NAGS.has('$14')).toBe(true); // +=
      expect(VALID_NAGS.has('$15')).toBe(true); // =+
      expect(VALID_NAGS.has('$16')).toBe(true); // ±
      expect(VALID_NAGS.has('$17')).toBe(true); // ∓
      expect(VALID_NAGS.has('$18')).toBe(true); // +-
      expect(VALID_NAGS.has('$19')).toBe(true); // -+
    });
  });

  describe('MOVE_QUALITY_NAGS', () => {
    it('should contain all 7 move quality NAGs', () => {
      expect(MOVE_QUALITY_NAGS).toHaveLength(7);
      expect(MOVE_QUALITY_NAGS).toContain('$1');
      expect(MOVE_QUALITY_NAGS).toContain('$7');
    });
  });

  describe('isValidNag', () => {
    it('should accept valid NAGs with $ prefix', () => {
      expect(isValidNag('$1')).toBe(true);
      expect(isValidNag('$2')).toBe(true);
      expect(isValidNag('$4')).toBe(true);
      expect(isValidNag('$18')).toBe(true);
    });

    it('should accept valid NAGs without $ prefix', () => {
      expect(isValidNag('1')).toBe(true);
      expect(isValidNag('3')).toBe(true);
      expect(isValidNag('14')).toBe(true);
    });

    it('should reject invalid NAGs', () => {
      expect(isValidNag('$999')).toBe(false);
      expect(isValidNag('invalid')).toBe(false);
      expect(isValidNag('$')).toBe(false);
      expect(isValidNag('')).toBe(false);
    });
  });

  describe('normalizeNag', () => {
    it('should add $ prefix if missing', () => {
      expect(normalizeNag('1')).toBe('$1');
      expect(normalizeNag('14')).toBe('$14');
    });

    it('should preserve $ prefix if present', () => {
      expect(normalizeNag('$1')).toBe('$1');
      expect(normalizeNag('$18')).toBe('$18');
    });
  });

  describe('classificationToNag', () => {
    it('should map brilliant to $3', () => {
      expect(classificationToNag('brilliant')).toBe('$3');
    });

    it('should map excellent to $1', () => {
      expect(classificationToNag('excellent')).toBe('$1');
    });

    it('should map inaccuracy to $6', () => {
      expect(classificationToNag('inaccuracy')).toBe('$6');
    });

    it('should map mistake to $2', () => {
      expect(classificationToNag('mistake')).toBe('$2');
    });

    it('should map blunder to $4', () => {
      expect(classificationToNag('blunder')).toBe('$4');
    });

    it('should map forced to $7', () => {
      expect(classificationToNag('forced')).toBe('$7');
    });

    it('should return undefined for good', () => {
      expect(classificationToNag('good')).toBeUndefined();
    });

    it('should return undefined for book', () => {
      expect(classificationToNag('book')).toBeUndefined();
    });
  });

  describe('filterValidNags', () => {
    it('should filter out invalid NAGs', () => {
      const input = ['$1', '$999', '$3', 'invalid'];
      const result = filterValidNags(input);
      expect(result).toEqual(['$1', '$3']);
    });

    it('should normalize NAGs in the output', () => {
      const input = ['1', '3'];
      const result = filterValidNags(input);
      expect(result).toEqual(['$1', '$3']);
    });

    it('should return empty array for empty input', () => {
      expect(filterValidNags([])).toEqual([]);
    });

    it('should return empty array when no valid NAGs', () => {
      expect(filterValidNags(['invalid', '$999'])).toEqual([]);
    });
  });

  describe('getNagDescription', () => {
    it('should return descriptions for common NAGs', () => {
      expect(getNagDescription('$1')).toBe('Good move');
      expect(getNagDescription('$2')).toBe('Mistake');
      expect(getNagDescription('$3')).toBe('Brilliant move');
      expect(getNagDescription('$4')).toBe('Blunder');
      expect(getNagDescription('$7')).toBe('Only move');
    });

    it('should return descriptions for positional NAGs', () => {
      expect(getNagDescription('$14')).toBe('White is slightly better');
      expect(getNagDescription('$18')).toBe('White is winning');
      expect(getNagDescription('$19')).toBe('Black is winning');
    });

    it('should handle NAGs without $ prefix', () => {
      expect(getNagDescription('1')).toBe('Good move');
    });

    it('should return "Unknown" for unknown NAGs', () => {
      expect(getNagDescription('$999')).toBe('Unknown');
    });
  });

  describe('getNagSymbol', () => {
    it('should return symbols for move quality NAGs', () => {
      expect(getNagSymbol('$1')).toBe('!');
      expect(getNagSymbol('$2')).toBe('?');
      expect(getNagSymbol('$3')).toBe('!!');
      expect(getNagSymbol('$4')).toBe('??');
      expect(getNagSymbol('$5')).toBe('!?');
      expect(getNagSymbol('$6')).toBe('?!');
    });

    it('should return symbols for positional NAGs', () => {
      expect(getNagSymbol('$14')).toBe('⩲');
      expect(getNagSymbol('$15')).toBe('⩱');
      expect(getNagSymbol('$18')).toBe('+-');
      expect(getNagSymbol('$19')).toBe('-+');
    });

    it('should handle NAGs without $ prefix', () => {
      expect(getNagSymbol('1')).toBe('!');
    });

    it('should return the normalized NAG for unknown codes', () => {
      expect(getNagSymbol('$999')).toBe('$999');
    });
  });

  // Two eval-perspective conventions coexist in nag-validator.ts:
  //
  //   1. WHITE-PERSPECTIVE (evalToPositionNag): cp > 0 always means White is
  //      better and mate > 0 always means White is mating, regardless of whose
  //      turn it is. The function has no side-to-move parameter at all.
  //   2. SIDE-TO-MOVE (evalToVerbalDescription with isWhiteToMove provided):
  //      a positive cp/mate means the SIDE TO MOVE is better/mating, so the
  //      same raw number can describe either color. When isWhiteToMove is
  //      omitted, it falls back to the White-perspective (legacy) reading.
  //
  // The tests below pin both conventions explicitly.
  describe('evalToPositionNag (White-perspective convention)', () => {
    it('treats cp > 0 as White better and cp < 0 as Black better (no side-to-move input)', () => {
      // Rating 1500 thresholds: equal < 40, slight < 100, clear < 250, else winning
      expect(evalToPositionNag(60, undefined, 1500)).toBe(POSITION_NAGS.slightWhite); // $14
      expect(evalToPositionNag(-60, undefined, 1500)).toBe(POSITION_NAGS.slightBlack); // $15
      expect(evalToPositionNag(120, undefined, 1500)).toBe(POSITION_NAGS.clearWhite); // $16
      expect(evalToPositionNag(-120, undefined, 1500)).toBe(POSITION_NAGS.clearBlack); // $17
      expect(evalToPositionNag(400, undefined, 1500)).toBe(POSITION_NAGS.winningWhite); // $18
      expect(evalToPositionNag(-400, undefined, 1500)).toBe(POSITION_NAGS.winningBlack); // $19
    });

    it('treats mate > 0 as White winning and mate < 0 as Black winning, taking precedence over cp', () => {
      expect(evalToPositionNag(undefined, 3, 1500)).toBe(POSITION_NAGS.winningWhite);
      expect(evalToPositionNag(undefined, -3, 1500)).toBe(POSITION_NAGS.winningBlack);
      // Mate wins over any cp value, even one favoring the other side
      expect(evalToPositionNag(-500, 1, 1500)).toBe(POSITION_NAGS.winningWhite);
      expect(evalToPositionNag(500, -1, 1500)).toBe(POSITION_NAGS.winningBlack);
    });

    it('applies rating-dependent thresholds at exact boundaries', () => {
      // Beginner (< 1400): equal 50, slight 150, clear 300
      expect(evalToPositionNag(49, undefined, 1000)).toBe(POSITION_NAGS.equal);
      expect(evalToPositionNag(50, undefined, 1000)).toBe(POSITION_NAGS.slightWhite);
      expect(evalToPositionNag(150, undefined, 1000)).toBe(POSITION_NAGS.clearWhite);
      expect(evalToPositionNag(300, undefined, 1000)).toBe(POSITION_NAGS.winningWhite);
      // Intermediate (1400-1799): equal 40, slight 100, clear 250
      expect(evalToPositionNag(39, undefined, 1400)).toBe(POSITION_NAGS.equal);
      expect(evalToPositionNag(40, undefined, 1400)).toBe(POSITION_NAGS.slightWhite);
      expect(evalToPositionNag(100, undefined, 1400)).toBe(POSITION_NAGS.clearWhite);
      expect(evalToPositionNag(250, undefined, 1400)).toBe(POSITION_NAGS.winningWhite);
      // Intermediate-advanced (1800-2199): equal 25, slight 75, clear 200
      expect(evalToPositionNag(24, undefined, 1800)).toBe(POSITION_NAGS.equal);
      expect(evalToPositionNag(25, undefined, 1800)).toBe(POSITION_NAGS.slightWhite);
      expect(evalToPositionNag(75, undefined, 1800)).toBe(POSITION_NAGS.clearWhite);
      expect(evalToPositionNag(200, undefined, 1800)).toBe(POSITION_NAGS.winningWhite);
      // Advanced/Expert (>= 2200): equal 15, slight 50, clear 150
      expect(evalToPositionNag(14, undefined, 2200)).toBe(POSITION_NAGS.equal);
      expect(evalToPositionNag(15, undefined, 2200)).toBe(POSITION_NAGS.slightWhite);
      expect(evalToPositionNag(50, undefined, 2200)).toBe(POSITION_NAGS.clearWhite);
      expect(evalToPositionNag(150, undefined, 2200)).toBe(POSITION_NAGS.winningWhite);
    });

    it('returns undefined when neither cp nor mate is provided', () => {
      expect(evalToPositionNag(undefined, undefined, 1500)).toBeUndefined();
    });
  });

  describe('evalToVerbalDescription (side-to-move convention)', () => {
    it('attributes a positive eval to the side to move when isWhiteToMove is provided', () => {
      // Same raw eval, opposite sides depending on whose turn it is
      expect(evalToVerbalDescription(120, undefined, true)).toBe('White has a comfortable edge');
      expect(evalToVerbalDescription(120, undefined, false)).toBe('Black has a comfortable edge');
      // Negative eval means the side to move is worse
      expect(evalToVerbalDescription(-120, undefined, true)).toBe('Black has a comfortable edge');
      expect(evalToVerbalDescription(-120, undefined, false)).toBe('White has a comfortable edge');
    });

    it('falls back to White-perspective (legacy mode) when isWhiteToMove is omitted', () => {
      expect(evalToVerbalDescription(120, undefined)).toBe('White has a comfortable edge');
      expect(evalToVerbalDescription(-120, undefined)).toBe('Black has a comfortable edge');
      expect(evalToVerbalDescription(undefined, -4)).toBe(
        'Black has a winning attack with mate in sight',
      );
    });

    it('uses the opposite convention from evalToPositionNag for the same raw eval', () => {
      // +120 with Black to move: White-perspective NAG says White is clearly
      // better, side-to-move verbal description says Black has the edge.
      expect(evalToPositionNag(120, undefined, 1500)).toBe(POSITION_NAGS.clearWhite);
      expect(evalToVerbalDescription(120, undefined, false)).toBe('Black has a comfortable edge');
    });

    it('describes mate from the side-to-move perspective with distance-based phrasing', () => {
      expect(evalToVerbalDescription(undefined, 1, true)).toBe('White delivers checkmate');
      expect(evalToVerbalDescription(undefined, 1, false)).toBe('Black delivers checkmate');
      expect(evalToVerbalDescription(undefined, 3, false)).toBe('Black has a forced mate in 3');
      // Negative mate means the side to move is getting mated
      expect(evalToVerbalDescription(undefined, -2, true)).toBe('Black has a forced mate in 2');
      expect(evalToVerbalDescription(undefined, 10, true)).toBe(
        'White has a winning attack with mate in sight',
      );
      expect(evalToVerbalDescription(undefined, 11, true)).toBe('White has a forced mate');
    });

    it('pins cp band boundaries and the no-eval fallback', () => {
      expect(evalToVerbalDescription(undefined, undefined, true)).toBe('position unclear');
      expect(evalToVerbalDescription(0, undefined, true)).toBe('the position is equal');
      expect(evalToVerbalDescription(24, undefined, true)).toBe('the position is equal');
      expect(evalToVerbalDescription(25, undefined, true)).toBe(
        'roughly equal with balanced chances',
      );
      expect(evalToVerbalDescription(50, undefined, true)).toBe('White has a slight pull');
      expect(evalToVerbalDescription(100, undefined, true)).toBe('White has a comfortable edge');
      // Documents current behavior; arguably a bug: the JSDoc example claims
      // evalToVerbalDescription(150, undefined, true) returns "White has a
      // comfortable edge", but the implementation's band is absCp < 150, so
      // 150 lands in the next band.
      expect(evalToVerbalDescription(150, undefined, true)).toBe('White has a clear advantage');
      expect(evalToVerbalDescription(200, undefined, true)).toBe('White is significantly better');
      expect(evalToVerbalDescription(300, undefined, true)).toBe('White has a winning advantage');
      expect(evalToVerbalDescription(500, undefined, true)).toBe('White is winning');
      expect(evalToVerbalDescription(800, undefined, true)).toBe('White has a decisive advantage');
    });

    it('documents current behavior for mate in 5; arguably a doc bug', () => {
      // The JSDoc example claims evalToVerbalDescription(undefined, 5, true)
      // returns "White has a forced mate in 5", but the "forced mate in N"
      // phrasing is only used for N <= 3; 4-10 use the "mate in sight" wording.
      expect(evalToVerbalDescription(undefined, 5, true)).toBe(
        'White has a winning attack with mate in sight',
      );
    });
  });

  describe('classificationToNag full mapping', () => {
    it('maps every classification to its documented NAG (or undefined)', () => {
      const expected: Record<MoveClassification, string | undefined> = {
        brilliant: '$3',
        excellent: '$1',
        good: undefined,
        book: undefined,
        inaccuracy: '$6',
        mistake: '$2',
        blunder: '$4',
        forced: '$7',
      };
      for (const [classification, nag] of Object.entries(expected)) {
        expect(classificationToNag(classification as MoveClassification)).toBe(nag);
      }
    });
  });

  describe('normalizeNag / filterValidNags idempotence', () => {
    it('normalizeNag is idempotent', () => {
      for (const input of ['1', '$1', '14', '$14', '999', '$999']) {
        const once = normalizeNag(input);
        expect(normalizeNag(once)).toBe(once);
      }
    });

    it('filterValidNags is idempotent (output passes through unchanged)', () => {
      const input = ['1', '$3', '999', 'invalid', '$14', '18'];
      const once = filterValidNags(input);
      expect(once).toEqual(['$1', '$3', '$14', '$18']);
      expect(filterValidNags(once)).toEqual(once);
    });
  });

  describe('isValidNag boundaries', () => {
    it('accepts codes in VALID_NAGS and rejects near-miss neighbors', () => {
      // $7 is the last move-quality NAG; $8 and $9 are not in the set
      expect(isValidNag('$7')).toBe(true);
      expect(isValidNag('$8')).toBe(false);
      expect(isValidNag('$9')).toBe(false);
      // $10-$13 positional block, $20/$21 gap before zugzwang codes
      expect(isValidNag('$10')).toBe(true);
      expect(isValidNag('$13')).toBe(true);
      expect(isValidNag('$20')).toBe(false);
      expect(isValidNag('$21')).toBe(false);
      expect(isValidNag('$22')).toBe(true);
      expect(isValidNag('$23')).toBe(true);
      // Highest codes: counterplay and time pressure
      expect(isValidNag('$133')).toBe(true);
      expect(isValidNag('$134')).toBe(false);
      expect(isValidNag('$139')).toBe(true);
      expect(isValidNag('$140')).toBe(false);
      // $0 does not exist; double prefix is not normalized away
      expect(isValidNag('$0')).toBe(false);
      expect(isValidNag('$$1')).toBe(false);
    });
  });
});
