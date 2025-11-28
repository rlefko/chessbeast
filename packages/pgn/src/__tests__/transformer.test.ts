/**
 * Tests for analysis-to-PGN transformer
 */

import { describe, it, expect } from 'vitest';

import { renderPgn, parsePgn } from '../index.js';
import {
  transformAnalysisToGame,
  hasAnnotations,
  countAnnotations,
  type GameAnalysisInput,
  type MoveAnalysisInput,
} from '../transformer/index.js';

/**
 * Helper to create a mock move analysis
 */
function createMockMove(overrides: Partial<MoveAnalysisInput> = {}): MoveAnalysisInput {
  return {
    plyIndex: 0,
    moveNumber: 1,
    isWhiteMove: true,
    san: 'e4',
    fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    evalBefore: { cp: 20, depth: 20, pv: ['e4', 'e5'] },
    evalAfter: { cp: 30, depth: 20, pv: ['e5', 'Nf3'] },
    bestMove: 'e4',
    cpLoss: 0,
    classification: 'good',
    isCriticalMoment: false,
    ...overrides,
  };
}

/**
 * Helper to create a mock game analysis
 */
function createMockAnalysis(overrides: Partial<GameAnalysisInput> = {}): GameAnalysisInput {
  return {
    metadata: {
      white: 'Player1',
      black: 'Player2',
      result: '1-0',
    },
    moves: [
      createMockMove({ plyIndex: 0, moveNumber: 1, isWhiteMove: true, san: 'e4' }),
      createMockMove({ plyIndex: 1, moveNumber: 1, isWhiteMove: false, san: 'e5' }),
      createMockMove({ plyIndex: 2, moveNumber: 2, isWhiteMove: true, san: 'Nf3' }),
      createMockMove({ plyIndex: 3, moveNumber: 2, isWhiteMove: false, san: 'Nc6' }),
    ],
    ...overrides,
  };
}

describe('Analysis Transformer', () => {
  describe('transformAnalysisToGame', () => {
    it('should transform basic analysis to ParsedGame', () => {
      const analysis = createMockAnalysis();
      const game = transformAnalysisToGame(analysis);

      expect(game.metadata.white).toBe('Player1');
      expect(game.metadata.black).toBe('Player2');
      expect(game.metadata.result).toBe('1-0');
      expect(game.moves).toHaveLength(4);
      expect(game.moves[0]!.san).toBe('e4');
    });

    it('should preserve move numbers and colors', () => {
      const analysis = createMockAnalysis();
      const game = transformAnalysisToGame(analysis);

      expect(game.moves[0]!.moveNumber).toBe(1);
      expect(game.moves[0]!.isWhiteMove).toBe(true);
      expect(game.moves[1]!.moveNumber).toBe(1);
      expect(game.moves[1]!.isWhiteMove).toBe(false);
      expect(game.moves[2]!.moveNumber).toBe(2);
      expect(game.moves[2]!.isWhiteMove).toBe(true);
    });

    it('should include summary as game comment when enabled', () => {
      const analysis = createMockAnalysis({
        summary: 'A tactical game with sharp play.',
      });
      const game = transformAnalysisToGame(analysis, { includeSummary: true });

      expect(game.gameComment).toBe('A tactical game with sharp play.');
    });

    it('should exclude summary when disabled', () => {
      const analysis = createMockAnalysis({
        summary: 'A tactical game.',
      });
      const game = transformAnalysisToGame(analysis, { includeSummary: false });

      expect(game.gameComment).toBeUndefined();
    });

    it('should include optional metadata fields', () => {
      const analysis = createMockAnalysis({
        metadata: {
          white: 'Magnus',
          black: 'Hikaru',
          result: '1/2-1/2',
          event: 'World Championship',
          site: 'Dubai',
          date: '2024.01.15',
          eco: 'C65',
          whiteElo: 2850,
          blackElo: 2800,
          timeControl: '90+30',
        },
      });
      const game = transformAnalysisToGame(analysis);

      expect(game.metadata.event).toBe('World Championship');
      expect(game.metadata.site).toBe('Dubai');
      expect(game.metadata.date).toBe('2024.01.15');
      expect(game.metadata.eco).toBe('C65');
      expect(game.metadata.whiteElo).toBe(2850);
      expect(game.metadata.blackElo).toBe(2800);
      expect(game.metadata.timeControl).toBe('90+30');
    });

    it('should use estimated ELO when actual ELO is not available', () => {
      const analysis = createMockAnalysis({
        metadata: {
          white: 'Player1',
          black: 'Player2',
          result: '1-0',
          estimatedWhiteElo: 1600,
          estimatedBlackElo: 1550,
        },
      });
      const game = transformAnalysisToGame(analysis);

      expect(game.metadata.whiteElo).toBe(1600);
      expect(game.metadata.blackElo).toBe(1550);
    });

    it('should prefer actual ELO over estimated', () => {
      const analysis = createMockAnalysis({
        metadata: {
          white: 'Player1',
          black: 'Player2',
          result: '1-0',
          whiteElo: 2000,
          blackElo: 1900,
          estimatedWhiteElo: 1600,
          estimatedBlackElo: 1550,
        },
      });
      const game = transformAnalysisToGame(analysis);

      expect(game.metadata.whiteElo).toBe(2000);
      expect(game.metadata.blackElo).toBe(1900);
    });
  });

  describe('NAG insertion', () => {
    it('should add NAG for brilliant moves', () => {
      const analysis = createMockAnalysis({
        moves: [createMockMove({ classification: 'brilliant' })],
      });
      const game = transformAnalysisToGame(analysis, { includeNags: true });

      expect(game.moves[0]!.nags).toContain('$3');
    });

    it('should add NAG for excellent moves at critical moments', () => {
      const analysis = createMockAnalysis({
        moves: [createMockMove({ classification: 'excellent', isCriticalMoment: true })],
      });
      const game = transformAnalysisToGame(analysis, { includeNags: true });

      expect(game.moves[0]!.nags).toContain('$1');
    });

    it('should skip excellent move NAG for non-critical positions', () => {
      const analysis = createMockAnalysis({
        moves: [createMockMove({ classification: 'excellent', isCriticalMoment: false })],
      });
      const game = transformAnalysisToGame(analysis, { includeNags: true });

      // $1 NAG is skipped for non-critical positions to reduce NAG overuse
      expect(game.moves[0]!.nags).toBeUndefined();
    });

    it('should add NAG for blunders', () => {
      const analysis = createMockAnalysis({
        moves: [createMockMove({ classification: 'blunder' })],
      });
      const game = transformAnalysisToGame(analysis, { includeNags: true });

      expect(game.moves[0]!.nags).toContain('$4');
    });

    it('should add NAG for mistakes', () => {
      const analysis = createMockAnalysis({
        moves: [createMockMove({ classification: 'mistake' })],
      });
      const game = transformAnalysisToGame(analysis, { includeNags: true });

      expect(game.moves[0]!.nags).toContain('$2');
    });

    it('should add NAG for inaccuracies', () => {
      const analysis = createMockAnalysis({
        moves: [createMockMove({ classification: 'inaccuracy' })],
      });
      const game = transformAnalysisToGame(analysis, { includeNags: true });

      expect(game.moves[0]!.nags).toContain('$6');
    });

    it('should add NAG for forced moves', () => {
      const analysis = createMockAnalysis({
        moves: [createMockMove({ classification: 'forced' })],
      });
      const game = transformAnalysisToGame(analysis, { includeNags: true });

      expect(game.moves[0]!.nags).toContain('$7');
    });

    it('should not add move quality NAG for good or book moves', () => {
      const analysis = createMockAnalysis({
        moves: [
          createMockMove({ classification: 'good' }),
          createMockMove({ classification: 'book', isWhiteMove: false }),
        ],
      });
      const game = transformAnalysisToGame(analysis, {
        includeNags: true,
        includePositionNags: false, // Disable to test only move quality NAGs
      });

      expect(game.moves[0]!.nags).toBeUndefined();
      expect(game.moves[1]!.nags).toBeUndefined();
    });

    it('should exclude NAGs when disabled', () => {
      const analysis = createMockAnalysis({
        moves: [createMockMove({ classification: 'blunder' })],
      });
      const game = transformAnalysisToGame(analysis, {
        includeNags: false,
        includePositionNags: false, // Also disable position NAGs
      });

      expect(game.moves[0]!.nags).toBeUndefined();
    });
  });

  describe('comment insertion', () => {
    it('should include move comments', () => {
      const analysis = createMockAnalysis({
        moves: [createMockMove({ comment: 'The best move in the position.' })],
      });
      const game = transformAnalysisToGame(analysis);

      expect(game.moves[0]!.commentAfter).toBe('The best move in the position.');
    });

    it('should handle moves without comments', () => {
      // createMockMove doesn't include a comment by default
      const analysis = createMockAnalysis({
        moves: [createMockMove({})],
      });
      const game = transformAnalysisToGame(analysis);

      expect(game.moves[0]!.commentAfter).toBeUndefined();
    });
  });

  describe('variation insertion', () => {
    it('should include alternatives as variations for critical moments', () => {
      const analysis = createMockAnalysis({
        moves: [
          createMockMove({
            isCriticalMoment: true, // Required for variations
            alternatives: [
              { san: 'd4', eval: { cp: 25, depth: 20, pv: ['d4', 'd5', 'c4'] } },
              { san: 'c4', eval: { cp: 20, depth: 20, pv: ['c4', 'e5'] } },
            ],
          }),
        ],
      });
      const game = transformAnalysisToGame(analysis, { includeVariations: true });

      // Max 2 variations for critical moments
      expect(game.moves[0]!.variations).toHaveLength(2);
      expect(game.moves[0]!.variations![0]![0]!.san).toBe('d4');
      expect(game.moves[0]!.variations![1]![0]!.san).toBe('c4');
    });

    it('should NOT include evaluation in variation comments (removed feature)', () => {
      const analysis = createMockAnalysis({
        moves: [
          createMockMove({
            isCriticalMoment: true, // Required for variations
            alternatives: [{ san: 'd4', eval: { cp: 50, depth: 20, pv: ['d4'] } }],
          }),
        ],
      });
      const game = transformAnalysisToGame(analysis, { includeVariations: true });

      // Evaluation numbers are now removed from variations
      expect(game.moves[0]!.variations![0]![0]!.commentAfter).toBeUndefined();
    });

    it('should NOT format mate scores in variations (removed feature)', () => {
      const analysis = createMockAnalysis({
        moves: [
          createMockMove({
            isCriticalMoment: true, // Required for variations
            alternatives: [{ san: 'Qh5', eval: { mate: 3, depth: 20, pv: ['Qh5'] } }],
          }),
        ],
      });
      const game = transformAnalysisToGame(analysis, { includeVariations: true });

      // Mate scores are now removed from variations (position NAGs indicate advantage instead)
      expect(game.moves[0]!.variations![0]![0]!.commentAfter).toBeUndefined();
    });

    it('should exclude variations when disabled', () => {
      const analysis = createMockAnalysis({
        moves: [
          createMockMove({
            alternatives: [{ san: 'd4', eval: { cp: 25, depth: 20, pv: ['d4'] } }],
          }),
        ],
      });
      const game = transformAnalysisToGame(analysis, { includeVariations: false });

      expect(game.moves[0]!.variations).toBeUndefined();
    });

    it('should include PV continuation in variations', () => {
      const analysis = createMockAnalysis({
        moves: [
          createMockMove({
            isCriticalMoment: true, // Required for variations
            alternatives: [{ san: 'd4', eval: { cp: 25, depth: 20, pv: ['d4', 'd5', 'c4'] } }],
          }),
        ],
      });
      const game = transformAnalysisToGame(analysis, { includeVariations: true });

      const variation = game.moves[0]!.variations![0]!;
      expect(variation).toHaveLength(3);
      expect(variation[0]!.san).toBe('d4');
      expect(variation[1]!.san).toBe('d5');
      expect(variation[2]!.san).toBe('c4');
    });

    it('should NOT include variations for non-critical moments', () => {
      const analysis = createMockAnalysis({
        moves: [
          createMockMove({
            isCriticalMoment: false, // Non-critical moment
            alternatives: [{ san: 'd4', eval: { cp: 25, depth: 20, pv: ['d4'] } }],
          }),
        ],
      });
      const game = transformAnalysisToGame(analysis, { includeVariations: true });

      // Non-critical moments should have no variations (empty array or undefined)
      const variations = game.moves[0]!.variations;
      expect(!variations || variations.length === 0).toBe(true);
    });
  });

  describe('hasAnnotations', () => {
    it('should return true when game has summary', () => {
      const game = transformAnalysisToGame(createMockAnalysis({ summary: 'Summary text' }), {
        includeSummary: true,
      });
      expect(hasAnnotations(game)).toBe(true);
    });

    it('should return true when moves have comments', () => {
      const game = transformAnalysisToGame(
        createMockAnalysis({
          moves: [createMockMove({ comment: 'Comment' })],
        }),
      );
      expect(hasAnnotations(game)).toBe(true);
    });

    it('should return true when moves have NAGs', () => {
      const game = transformAnalysisToGame(
        createMockAnalysis({
          moves: [createMockMove({ classification: 'blunder' })],
        }),
        { includeNags: true },
      );
      expect(hasAnnotations(game)).toBe(true);
    });

    it('should return true when moves have variations', () => {
      const game = transformAnalysisToGame(
        createMockAnalysis({
          moves: [
            createMockMove({
              isCriticalMoment: true, // Required for variations
              alternatives: [{ san: 'd4', eval: { cp: 25, depth: 20, pv: ['d4'] } }],
            }),
          ],
        }),
        { includeVariations: true },
      );
      expect(hasAnnotations(game)).toBe(true);
    });

    it('should return false when no annotations present', () => {
      const game = transformAnalysisToGame(createMockAnalysis(), {
        includeSummary: false,
        includeNags: false,
        includePositionNags: false, // Also disable position NAGs
        includeVariations: false,
      });
      expect(hasAnnotations(game)).toBe(false);
    });
  });

  describe('countAnnotations', () => {
    it('should count all annotation types', () => {
      const analysis = createMockAnalysis({
        summary: 'Game summary',
        moves: [
          createMockMove({
            classification: 'blunder',
            comment: 'Bad move',
            isCriticalMoment: true, // Required for variations
            alternatives: [{ san: 'd4', eval: { cp: 25, depth: 20, pv: ['d4'] } }],
          }),
        ],
      });
      const game = transformAnalysisToGame(analysis, {
        includeSummary: true,
        includeNags: true,
        includePositionNags: false, // Disable for predictable count
        includeVariations: true,
      });
      const counts = countAnnotations(game);

      expect(counts.comments).toBe(2); // Summary + move comment
      expect(counts.nags).toBe(1); // Blunder NAG (position NAGs disabled)
      expect(counts.variations).toBe(1); // One alternative
    });

    it('should count position NAGs when enabled', () => {
      const analysis = createMockAnalysis({
        moves: [
          createMockMove({
            classification: 'blunder',
            evalAfter: { cp: 300, depth: 20, pv: ['d4'] }, // White winning
          }),
        ],
      });
      const game = transformAnalysisToGame(analysis, {
        includeSummary: false,
        includeNags: true,
        includePositionNags: true,
        includeVariations: false,
      });
      const counts = countAnnotations(game);

      // Only blunder NAG ($4) - position NAGs are now only at end of explored variations
      // This prevents cluttered output like: 1. e4 $4 $18 (blunder AND position assessment)
      expect(counts.nags).toBe(1);
    });
  });

  describe('round-trip tests', () => {
    it('should produce parseable PGN', () => {
      const analysis = createMockAnalysis({
        summary: 'A short game.',
        moves: [
          createMockMove({
            plyIndex: 0,
            moveNumber: 1,
            isWhiteMove: true,
            san: 'e4',
            classification: 'good',
            comment: 'Best opening move.',
          }),
          createMockMove({
            plyIndex: 1,
            moveNumber: 1,
            isWhiteMove: false,
            san: 'e5',
            classification: 'good',
          }),
        ],
      });

      const game = transformAnalysisToGame(analysis);
      const pgn = renderPgn(game);
      const reparsed = parsePgn(pgn);

      expect(reparsed).toHaveLength(1);
      expect(reparsed[0]!.moves).toHaveLength(2);
      expect(reparsed[0]!.moves[0]!.san).toBe('e4');
      expect(reparsed[0]!.moves[0]!.commentAfter).toBe('Best opening move.');
    });

    it('should preserve annotations through round-trip', () => {
      const analysis = createMockAnalysis({
        moves: [
          createMockMove({
            plyIndex: 0,
            moveNumber: 1,
            isWhiteMove: true,
            san: 'e4',
            classification: 'excellent',
            isCriticalMoment: true, // Required for $1 NAG to be added
            comment: 'Great move!',
          }),
        ],
      });

      const game = transformAnalysisToGame(analysis, { includeNags: true });
      const pgn = renderPgn(game);
      const reparsed = parsePgn(pgn);

      expect(reparsed[0]!.moves[0]!.commentAfter).toBe('Great move!');
      expect(reparsed[0]!.moves[0]!.nags).toContain('$1');
    });
  });
});
