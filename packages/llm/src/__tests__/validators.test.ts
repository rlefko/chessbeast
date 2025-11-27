/**
 * Tests for validators
 */

import { describe, it, expect } from 'vitest';

import { ValidationError } from '../errors.js';
import {
  extractMoveReferences,
  isLegalMove,
  validateMoveReferences,
} from '../validator/move-validator.js';
import {
  isValidNag,
  normalizeNag,
  classificationToNag,
  filterValidNags,
} from '../validator/nag-validator.js';
import {
  parseJsonResponse,
  validateComment,
  validateSummary,
  sanitizePgnComment,
} from '../validator/output-validator.js';

describe('NAG Validator', () => {
  describe('isValidNag', () => {
    it('should accept valid NAGs with $ prefix', () => {
      expect(isValidNag('$1')).toBe(true);
      expect(isValidNag('$2')).toBe(true);
      expect(isValidNag('$4')).toBe(true);
    });

    it('should accept valid NAGs without $ prefix', () => {
      expect(isValidNag('1')).toBe(true);
      expect(isValidNag('3')).toBe(true);
    });

    it('should reject invalid NAGs', () => {
      expect(isValidNag('$999')).toBe(false);
      expect(isValidNag('invalid')).toBe(false);
    });
  });

  describe('normalizeNag', () => {
    it('should add $ prefix if missing', () => {
      expect(normalizeNag('1')).toBe('$1');
      expect(normalizeNag('$1')).toBe('$1');
    });
  });

  describe('classificationToNag', () => {
    it('should map classifications to NAGs', () => {
      expect(classificationToNag('brilliant')).toBe('$3');
      expect(classificationToNag('blunder')).toBe('$4');
      expect(classificationToNag('mistake')).toBe('$2');
      expect(classificationToNag('good')).toBeUndefined();
    });
  });

  describe('filterValidNags', () => {
    it('should filter out invalid NAGs', () => {
      const input = ['$1', '$999', '$3', 'invalid'];
      const result = filterValidNags(input);
      expect(result).toEqual(['$1', '$3']);
    });
  });
});

describe('Move Validator', () => {
  describe('extractMoveReferences', () => {
    it('should extract SAN moves from text', () => {
      const text = 'The best move was Nf3, followed by e4 or Bb5+';
      const moves = extractMoveReferences(text);
      expect(moves).toContain('Nf3');
      expect(moves).toContain('e4');
      expect(moves).toContain('Bb5+');
    });

    it('should extract castling', () => {
      const text = 'White should castle with O-O or O-O-O';
      const moves = extractMoveReferences(text);
      expect(moves).toContain('O-O');
      expect(moves).toContain('O-O-O');
    });

    it('should extract captures', () => {
      const text = 'After Bxc6 and exd5, the position is equal';
      const moves = extractMoveReferences(text);
      expect(moves).toContain('Bxc6');
      expect(moves).toContain('exd5');
    });

    it('should extract promotions', () => {
      const text = 'The pawn promotes with e8=Q#';
      const moves = extractMoveReferences(text);
      expect(moves).toContain('e8=Q#');
    });
  });

  describe('isLegalMove', () => {
    const legalMoves = ['e4', 'Nf3', 'Bb5', 'O-O'];

    it('should return true for legal moves', () => {
      expect(isLegalMove('e4', legalMoves)).toBe(true);
      expect(isLegalMove('Nf3', legalMoves)).toBe(true);
    });

    it('should return false for illegal moves', () => {
      expect(isLegalMove('Qh7', legalMoves)).toBe(false);
    });

    it('should match moves ignoring check symbols', () => {
      expect(isLegalMove('Bb5+', legalMoves)).toBe(true);
    });
  });

  describe('validateMoveReferences', () => {
    it('should identify hallucinated moves', () => {
      const text = 'Best was Nf3, not Qh7#';
      const legalMoves = ['Nf3', 'e4'];
      const result = validateMoveReferences(text, legalMoves);

      expect(result.hasHallucinations).toBe(true);
      expect(result.hallucinations).toContain('Qh7#');
      expect(result.validMoves).toContain('Nf3');
    });
  });
});

describe('Output Validator', () => {
  describe('parseJsonResponse', () => {
    it('should parse valid JSON', () => {
      const response = '{"comment": "test", "nags": []}';
      const result = parseJsonResponse<{ comment: string }>(response);
      expect(result.comment).toBe('test');
    });

    it('should extract JSON from mixed content', () => {
      const response = 'Here is the analysis: {"comment": "test"}';
      const result = parseJsonResponse<{ comment: string }>(response);
      expect(result.comment).toBe('test');
    });

    it('should throw on invalid JSON', () => {
      expect(() => parseJsonResponse('not json')).toThrow(ValidationError);
    });
  });

  describe('validateComment', () => {
    it('should validate valid comments', () => {
      const raw = { comment: 'Good move', nags: ['$1'] };
      const result = validateComment(raw, []);
      expect(result.valid).toBe(true);
      expect(result.sanitized.comment).toBe('Good move');
      expect(result.sanitized.nags).toEqual(['$1']);
    });

    it('should filter invalid NAGs', () => {
      const raw = { comment: 'Move', nags: ['$1', '$999'] };
      const result = validateComment(raw, []);
      expect(result.sanitized.nags).toEqual(['$1']);
    });

    it('should warn about hallucinated moves', () => {
      const raw = { comment: 'Qh7 is winning', nags: [] };
      const legalMoves = ['e4', 'Nf3'];
      const result = validateComment(raw, legalMoves);
      expect(result.issues.some((i) => i.message.includes('hallucinated'))).toBe(true);
    });

    it('should truncate long comments', () => {
      const raw = { comment: 'x'.repeat(2500), nags: [] };
      const result = validateComment(raw, []);
      expect(result.sanitized.comment).toBeDefined();
      expect(result.sanitized.comment!.length).toBeLessThanOrEqual(2003); // 2000 + '...'
    });
  });

  describe('validateSummary', () => {
    it('should validate valid summaries', () => {
      const raw = {
        gameNarrative: 'White won the game',
        lessonsLearned: ['Avoid blunders', 'Castle early'],
      };
      const result = validateSummary(raw);
      expect(result.valid).toBe(true);
    });

    it('should fail on missing required fields', () => {
      const raw = { openingSynopsis: 'Test' };
      const result = validateSummary(raw);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.field === 'gameNarrative')).toBe(true);
    });

    it('should limit lessons to 3', () => {
      const raw = {
        gameNarrative: 'Game',
        lessonsLearned: ['1', '2', '3', '4', '5'],
      };
      const result = validateSummary(raw);
      expect(result.sanitized.lessonsLearned).toHaveLength(3);
    });
  });

  describe('sanitizePgnComment', () => {
    it('should escape curly braces', () => {
      const text = 'Move {variation} here';
      const result = sanitizePgnComment(text);
      expect(result).toBe('Move (variation) here');
    });

    it('should remove newlines', () => {
      const text = 'Line 1\nLine 2';
      const result = sanitizePgnComment(text);
      expect(result).toBe('Line 1 Line 2');
    });
  });
});
