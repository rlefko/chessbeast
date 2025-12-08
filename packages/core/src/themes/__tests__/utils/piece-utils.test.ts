/**
 * Piece Utility Tests
 */

import { ChessPosition } from '@chessbeast/pgn';
import { describe, it, expect } from 'vitest';

import type { LocatedPiece } from '../../types.js';
import {
  getPieceValue,
  pieceName,
  formatPieceAtSquare,
  getKnightMoves,
  getPawnCaptureSquares,
  findKing,
  getSlidingPieces,
} from '../../utils/piece-utils.js';

describe('Piece Utilities', () => {
  describe('getPieceValue', () => {
    it('returns 100 for pawn', () => {
      expect(getPieceValue('p')).toBe(100);
    });

    it('returns 320 for knight', () => {
      expect(getPieceValue('n')).toBe(320);
    });

    it('returns 330 for bishop', () => {
      expect(getPieceValue('b')).toBe(330);
    });

    it('returns 500 for rook', () => {
      expect(getPieceValue('r')).toBe(500);
    });

    it('returns 900 for queen', () => {
      expect(getPieceValue('q')).toBe(900);
    });

    it('returns high value for king (used in pin calculations)', () => {
      expect(getPieceValue('k')).toBe(20000);
    });

    it('returns 0 for unknown piece', () => {
      expect(getPieceValue('x')).toBe(0);
    });
  });

  describe('pieceName', () => {
    it('returns pawn for p', () => {
      expect(pieceName('p')).toBe('pawn');
    });

    it('returns knight for n', () => {
      expect(pieceName('n')).toBe('knight');
    });

    it('returns bishop for b', () => {
      expect(pieceName('b')).toBe('bishop');
    });

    it('returns rook for r', () => {
      expect(pieceName('r')).toBe('rook');
    });

    it('returns queen for q', () => {
      expect(pieceName('q')).toBe('queen');
    });

    it('returns king for k', () => {
      expect(pieceName('k')).toBe('king');
    });

    it('handles uppercase', () => {
      expect(pieceName('N')).toBe('knight');
      expect(pieceName('Q')).toBe('queen');
    });
  });

  describe('formatPieceAtSquare', () => {
    it('formats white knight', () => {
      const piece: LocatedPiece = { type: 'n', color: 'w', square: 'f3' };
      expect(formatPieceAtSquare(piece)).toBe('Nf3');
    });

    it('formats black queen', () => {
      const piece: LocatedPiece = { type: 'q', color: 'b', square: 'd8' };
      expect(formatPieceAtSquare(piece)).toBe('Qd8');
    });

    it('formats pawn (no piece prefix)', () => {
      const piece: LocatedPiece = { type: 'p', color: 'w', square: 'e4' };
      expect(formatPieceAtSquare(piece)).toBe('e4');
    });

    it('formats white king', () => {
      const piece: LocatedPiece = { type: 'k', color: 'w', square: 'e1' };
      expect(formatPieceAtSquare(piece)).toBe('Ke1');
    });
  });

  describe('getKnightMoves', () => {
    it('returns 8 moves from center', () => {
      const moves = getKnightMoves('e4');
      expect(moves.length).toBe(8);
      expect(moves).toContain('f6');
      expect(moves).toContain('g5');
      expect(moves).toContain('g3');
      expect(moves).toContain('f2');
      expect(moves).toContain('d2');
      expect(moves).toContain('c3');
      expect(moves).toContain('c5');
      expect(moves).toContain('d6');
    });

    it('returns 2 moves from corner', () => {
      const moves = getKnightMoves('a1');
      expect(moves.length).toBe(2);
      expect(moves).toContain('b3');
      expect(moves).toContain('c2');
    });

    it('returns 4 moves from edge', () => {
      const moves = getKnightMoves('h4');
      expect(moves.length).toBe(4);
    });

    it('returns 3 moves from b1', () => {
      const moves = getKnightMoves('b1');
      expect(moves.length).toBe(3);
    });
  });

  describe('getPawnCaptureSquares', () => {
    it('returns two capture squares for white pawn in center', () => {
      const squares = getPawnCaptureSquares('e4', 'w');
      expect(squares.length).toBe(2);
      expect(squares).toContain('d5');
      expect(squares).toContain('f5');
    });

    it('returns two capture squares for black pawn in center', () => {
      const squares = getPawnCaptureSquares('e5', 'b');
      expect(squares.length).toBe(2);
      expect(squares).toContain('d4');
      expect(squares).toContain('f4');
    });

    it('returns one capture square for a-file pawn', () => {
      const squares = getPawnCaptureSquares('a4', 'w');
      expect(squares.length).toBe(1);
      expect(squares).toContain('b5');
    });

    it('returns one capture square for h-file pawn', () => {
      const squares = getPawnCaptureSquares('h4', 'w');
      expect(squares.length).toBe(1);
      expect(squares).toContain('g5');
    });
  });

  describe('findKing', () => {
    it('finds white king', () => {
      const pos = new ChessPosition('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
      const kingSquare = findKing(pos, 'w');
      expect(kingSquare).toBe('e1');
    });

    it('finds black king', () => {
      const pos = new ChessPosition('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
      const kingSquare = findKing(pos, 'b');
      expect(kingSquare).toBe('e8');
    });

    it('finds king on different square', () => {
      const pos = new ChessPosition('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
      expect(findKing(pos, 'w')).toBe('e1');
      expect(findKing(pos, 'b')).toBe('e8');
    });

    it('finds castled king', () => {
      const pos = new ChessPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQK2R w KQkq - 0 1');
      expect(findKing(pos, 'w')).toBe('e1');
    });
  });

  describe('getSlidingPieces', () => {
    it('returns rooks, bishops, and queens', () => {
      const pos = new ChessPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      const slidingPieces = getSlidingPieces(pos, 'w');

      const types = slidingPieces.map((p) => p.type);
      expect(types).toContain('r');
      expect(types).toContain('b');
      expect(types).toContain('q');
      expect(types).not.toContain('n');
      expect(types).not.toContain('p');
      expect(types).not.toContain('k');
    });

    it('returns correct number of sliding pieces', () => {
      const pos = new ChessPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      const whiteSlidingPieces = getSlidingPieces(pos, 'w');
      // 2 rooks + 2 bishops + 1 queen = 5
      expect(whiteSlidingPieces.length).toBe(5);
    });

    it('returns empty for position without sliding pieces', () => {
      const pos = new ChessPosition('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
      const slidingPieces = getSlidingPieces(pos, 'w');
      expect(slidingPieces.length).toBe(0);
    });

    it('includes square information', () => {
      const pos = new ChessPosition('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
      const slidingPieces = getSlidingPieces(pos, 'w');
      expect(slidingPieces.length).toBe(1);
      expect(slidingPieces[0]?.square).toBe('a1');
    });
  });
});
