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
  evalToVerbalDescription,
} from '../validator/nag-validator.js';
import {
  parseJsonResponse,
  validateComment,
  validateSummary,
  sanitizePgnComment,
  stripCentipawnPatterns,
  stripMetaContent,
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

  describe('stripCentipawnPatterns', () => {
    it('should strip cp values', () => {
      expect(stripCentipawnPatterns('Lost 150cp here')).toBe('Lost here');
      expect(stripCentipawnPatterns('Evaluation: +1.5cp advantage')).toBe('Evaluation: advantage');
    });

    it('should strip decimal evals', () => {
      expect(stripCentipawnPatterns('Position is +1.5 for White')).toBe('Position is for White');
      expect(stripCentipawnPatterns('Eval is -0.3 now')).toBe('Eval is now');
    });

    it('should strip centipawn words', () => {
      expect(stripCentipawnPatterns('A 200 centipawns loss')).toBe('A loss');
      expect(stripCentipawnPatterns('The cp loss was significant')).toBe('The was significant');
    });

    it('should strip pawns notation', () => {
      expect(stripCentipawnPatterns('About ~0.38 pawns advantage')).toBe('About advantage');
      expect(stripCentipawnPatterns('Worth 2 pawns')).toBe('Worth');
    });

    it('should preserve move notation', () => {
      expect(stripCentipawnPatterns('e4 is strong')).toBe('e4 is strong');
      expect(stripCentipawnPatterns('After Nf3')).toBe('After Nf3');
    });

    it('should preserve normal text', () => {
      expect(stripCentipawnPatterns('Knight takes bishop')).toBe('Knight takes bishop');
    });
  });

  describe('stripMetaContent', () => {
    it('should strip "Summary" headers', () => {
      expect(stripMetaContent('Summary (Black to move): The knight is weak')).toBe(
        'The knight is weak',
      );
    });

    it('should strip classification echoes', () => {
      expect(stripMetaContent('This is a blunder because the knight hangs')).toBe(
        'because the knight hangs',
      );
      expect(stripMetaContent('A costly mistake. The rook is lost.')).toBe('The rook is lost.');
    });

    it('should strip filler starters', () => {
      expect(stripMetaContent('Interestingly, white wins')).toBe('white wins');
      expect(stripMetaContent('Notably, the knight is strong')).toBe('the knight is strong');
    });

    it('should preserve case after stripping', () => {
      const result = stripMetaContent('interestingly, the position is equal');
      expect(result.charAt(0)).toBe('t');
    });

    it('should preserve normal text', () => {
      expect(stripMetaContent('The knight threatens the queen')).toBe(
        'The knight threatens the queen',
      );
    });
  });

  describe('validateComment character limits', () => {
    it('should truncate comments exceeding hard limit (150 chars for initial type)', () => {
      const longComment = 'A'.repeat(200); // 200 chars, exceeds 150 hard limit
      const raw = { comment: longComment, nags: [] };
      const result = validateComment(raw, []);
      expect(result.sanitized.comment!.length).toBeLessThanOrEqual(150);
    });

    it('should warn but not truncate comments between soft and hard limits', () => {
      const mediumComment = 'A'.repeat(100); // 100 chars, between 75 soft and 150 hard
      const raw = { comment: mediumComment, nags: [] };
      const result = validateComment(raw, []);
      expect(result.sanitized.comment!.length).toBe(100);
      expect(result.issues.some((i) => i.message.includes('soft limit'))).toBe(true);
    });

    it('should allow comments under soft limit without warnings', () => {
      const shortComment = 'allows Nxe5'; // 11 chars, well under 75 soft limit
      const raw = { comment: shortComment, nags: [] };
      const result = validateComment(raw, []);
      expect(result.sanitized.comment).toBe('allows Nxe5');
      expect(result.issues.some((i) => i.message.includes('chars'))).toBe(false);
    });
  });

  describe('validateComment centipawn stripping', () => {
    it('should strip centipawn values from comments', () => {
      const raw = { comment: 'Lost 150cp with this move', nags: [] };
      const result = validateComment(raw, []);
      expect(result.sanitized.comment).not.toContain('150cp');
    });
  });
});

describe('evalToVerbalDescription', () => {
  describe('equal positions', () => {
    it('should describe truly equal positions', () => {
      expect(evalToVerbalDescription(10, undefined)).toBe('the position is equal');
    });

    it('should describe roughly equal positions', () => {
      expect(evalToVerbalDescription(30, undefined)).toBe('roughly equal with balanced chances');
    });
  });

  describe('advantages', () => {
    it('should describe slight advantages', () => {
      expect(evalToVerbalDescription(80, undefined)).toContain('slight pull');
      expect(evalToVerbalDescription(-80, undefined)).toContain('Black');
    });

    it('should describe clear advantages', () => {
      expect(evalToVerbalDescription(180, undefined)).toContain('clear advantage');
    });

    it('should describe winning positions', () => {
      expect(evalToVerbalDescription(600, undefined)).toContain('winning');
    });

    it('should describe decisive advantages', () => {
      expect(evalToVerbalDescription(900, undefined)).toContain('decisive');
    });
  });

  describe('mate situations', () => {
    it('should describe immediate checkmate', () => {
      expect(evalToVerbalDescription(undefined, 1)).toContain('checkmate');
    });

    it('should describe short forced mates', () => {
      expect(evalToVerbalDescription(undefined, 3)).toContain('forced mate in 3');
    });

    it('should describe longer mates', () => {
      const result = evalToVerbalDescription(undefined, 15);
      expect(result).toContain('forced mate');
    });

    it('should handle black mating', () => {
      expect(evalToVerbalDescription(undefined, -2)).toContain('Black');
    });
  });

  describe('undefined evaluation', () => {
    it('should handle undefined cp with no mate', () => {
      expect(evalToVerbalDescription(undefined, undefined)).toBe('position unclear');
    });
  });

  describe('side-to-move perspective', () => {
    it('should interpret positive cp as White better when White to move', () => {
      // White to move, +120 = White is better (120 is in "comfortable edge" range 100-149)
      expect(evalToVerbalDescription(120, undefined, true)).toContain('White');
      expect(evalToVerbalDescription(120, undefined, true)).toContain('comfortable edge');
    });

    it('should interpret positive cp as Black better when Black to move', () => {
      // Black to move, +120 = Black is better
      expect(evalToVerbalDescription(120, undefined, false)).toContain('Black');
      expect(evalToVerbalDescription(120, undefined, false)).toContain('comfortable edge');
    });

    it('should interpret negative cp as Black better when White to move', () => {
      // White to move, -150 = Black is better
      expect(evalToVerbalDescription(-150, undefined, true)).toContain('Black');
    });

    it('should interpret negative cp as White better when Black to move', () => {
      // Black to move, -150 = White is better
      expect(evalToVerbalDescription(-150, undefined, false)).toContain('White');
    });

    it('should interpret mate perspective correctly', () => {
      // White to move, +3 mate = White is mating
      expect(evalToVerbalDescription(undefined, 3, true)).toContain('White');
      // Black to move, +3 mate = Black is mating
      expect(evalToVerbalDescription(undefined, 3, false)).toContain('Black');
      // White to move, -3 mate = Black is mating
      expect(evalToVerbalDescription(undefined, -3, true)).toContain('Black');
      // Black to move, -3 mate = White is mating
      expect(evalToVerbalDescription(undefined, -3, false)).toContain('White');
    });
  });
});
