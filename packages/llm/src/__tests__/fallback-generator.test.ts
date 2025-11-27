/**
 * Tests for fallback generator
 */

import { describe, it, expect } from 'vitest';

import {
  generateFallbackComment,
  generateFallbackSummary,
} from '../generator/fallback-generator.js';

import { createMockGameAnalysis } from './mocks/mock-openai.js';

describe('Fallback Generator', () => {
  describe('generateFallbackComment', () => {
    it('should generate NAG only for blunders without critical moment', () => {
      const move = {
        plyIndex: 10,
        moveNumber: 6,
        isWhiteMove: true,
        san: 'Bxf7',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        fenAfter: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        evalBefore: { cp: 50, depth: 20, pv: [] },
        evalAfter: { cp: -200, depth: 20, pv: [] },
        bestMove: 'O-O',
        cpLoss: 250,
        classification: 'blunder' as const,
        isCriticalMoment: true,
      };

      // v3 change: without a critical moment context, fallback only provides NAG
      // The LLM is responsible for generating actual commentary
      const result = generateFallbackComment(move);

      expect(result.comment).toBeUndefined();
      expect(result.nags).toContain('$4');
    });

    it('should generate NAG only for mistakes without critical moment', () => {
      const move = {
        plyIndex: 10,
        moveNumber: 6,
        isWhiteMove: true,
        san: 'Nc3',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        fenAfter: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        evalBefore: { cp: 50, depth: 20, pv: [] },
        evalAfter: { cp: -50, depth: 20, pv: [] },
        bestMove: 'Nf3',
        cpLoss: 100,
        classification: 'mistake' as const,
        isCriticalMoment: false,
      };

      // v3 change: without critical moment, fallback only provides NAG
      const result = generateFallbackComment(move);

      expect(result.comment).toBeUndefined();
      expect(result.nags).toContain('$2');
    });

    it('should generate comment for brilliant moves', () => {
      const move = {
        plyIndex: 10,
        moveNumber: 6,
        isWhiteMove: true,
        san: 'Qxh7',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        fenAfter: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        evalBefore: { cp: 50, depth: 20, pv: [] },
        evalAfter: { cp: 500, depth: 20, pv: [] },
        bestMove: 'Qxh7',
        cpLoss: 0,
        classification: 'brilliant' as const,
        isCriticalMoment: true,
      };

      const result = generateFallbackComment(move);

      // v3 change: brilliant moves don't get fallback comments - NAG (!) is sufficient
      expect(result.comment).toBeUndefined();
      expect(result.nags).toContain('$3');
    });

    it('should generate no comment for good moves', () => {
      const move = {
        plyIndex: 10,
        moveNumber: 6,
        isWhiteMove: true,
        san: 'Nf3',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        fenAfter: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        evalBefore: { cp: 50, depth: 20, pv: [] },
        evalAfter: { cp: 50, depth: 20, pv: [] },
        bestMove: 'Nf3',
        cpLoss: 0,
        classification: 'good' as const,
        isCriticalMoment: false,
      };

      const result = generateFallbackComment(move);

      // v3 change: returns undefined instead of empty string (silence is better)
      expect(result.comment).toBeUndefined();
      expect(result.nags).toEqual([]);
    });

    it('should use critical moment template when provided', () => {
      const move = {
        plyIndex: 10,
        moveNumber: 6,
        isWhiteMove: true,
        san: 'Bxf7',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        fenAfter: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        evalBefore: { cp: 200, depth: 20, pv: [] },
        evalAfter: { cp: -100, depth: 20, pv: [] },
        bestMove: 'O-O',
        cpLoss: 300,
        classification: 'mistake' as const,
        isCriticalMoment: true,
      };

      const criticalMoment = {
        plyIndex: 10,
        type: 'eval_swing' as const,
        score: 80,
        reason: 'Large evaluation change',
      };

      const result = generateFallbackComment(move, criticalMoment);

      // v3 change: fallback now suggests the better move instead of generic text
      // cpLoss >= 100 with bestMove = "O-O was stronger."
      expect(result.comment).toContain('O-O');
      expect(result.comment).toContain('stronger');
    });
  });

  describe('generateFallbackSummary', () => {
    it('should generate a summary from game analysis', () => {
      const analysis = createMockGameAnalysis();
      const result = generateFallbackSummary(analysis);

      expect(result.gameNarrative).toBeTruthy();
      expect(result.lessonsLearned.length).toBeGreaterThan(0);
      expect(result.lessonsLearned.length).toBeLessThanOrEqual(3);
    });

    it('should include opening synopsis when available', () => {
      const analysis = createMockGameAnalysis();
      const result = generateFallbackSummary(analysis);

      expect(result.openingSynopsis).toContain('Sicilian Defense');
    });

    it('should include key moments', () => {
      const analysis = createMockGameAnalysis();
      const result = generateFallbackSummary(analysis);

      expect(result.keyMoments).toBeDefined();
      expect(result.keyMoments!.length).toBeGreaterThan(0);
    });

    it('should describe the result', () => {
      const analysis = createMockGameAnalysis();
      const result = generateFallbackSummary(analysis);

      expect(result.gameNarrative).toContain('Player1');
    });
  });
});
