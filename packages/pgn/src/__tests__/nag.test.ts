/**
 * Tests for NAG (Numeric Annotation Glyph) utilities
 */

import { describe, it, expect } from 'vitest';

import {
  VALID_NAGS,
  MOVE_QUALITY_NAGS,
  isValidNag,
  normalizeNag,
  classificationToNag,
  filterValidNags,
  getNagDescription,
  getNagSymbol,
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
});
