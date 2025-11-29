import { describe, it, expect } from 'vitest';

import { ChessPosition, STARTING_FEN, InvalidFenError, IllegalMoveError } from '../index.js';

describe('ChessPosition', () => {
  describe('constructor and factory methods', () => {
    it('creates starting position by default', () => {
      const pos = new ChessPosition();
      expect(pos.fen()).toBe(STARTING_FEN);
    });

    it('creates position from FEN', () => {
      // Note: chess.js normalizes FEN - removes en passant square if no capture possible
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
      const pos = new ChessPosition(fen);
      expect(pos.fen()).toBe(fen);
    });

    it('creates starting position via static method', () => {
      const pos = ChessPosition.startingPosition();
      expect(pos.fen()).toBe(STARTING_FEN);
    });

    it('creates position from FEN via static method', () => {
      // Note: chess.js normalizes FEN - removes en passant square if no capture possible
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
      const pos = ChessPosition.fromFen(fen);
      expect(pos.fen()).toBe(fen);
    });

    it('throws InvalidFenError for invalid FEN', () => {
      expect(() => new ChessPosition('invalid')).toThrow(InvalidFenError);
      expect(() => ChessPosition.fromFen('invalid')).toThrow(InvalidFenError);
    });
  });

  describe('FEN handling', () => {
    it('round-trips FEN correctly', () => {
      const testFens = [
        STARTING_FEN,
        // Note: chess.js normalizes en passant - only keeps it if capture is possible
        'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
        'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
        '8/8/8/8/8/8/8/4K2k w - - 0 1', // Endgame position
      ];

      for (const fen of testFens) {
        const pos = ChessPosition.fromFen(fen);
        expect(pos.fen()).toBe(fen);
      }
    });

    it('preserves castling rights', () => {
      const pos = ChessPosition.fromFen('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
      expect(pos.fen()).toContain('KQkq');
    });

    it('preserves en passant square when capture is possible', () => {
      // En passant is only valid if there's an enemy pawn that can capture
      // Position with white pawn on e5, black pawn just moved d7-d5
      const pos = ChessPosition.fromFen(
        'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3',
      );
      expect(pos.fen()).toContain('d6');
    });
  });

  describe('move', () => {
    it('applies legal moves correctly', () => {
      const pos = ChessPosition.startingPosition();
      const result = pos.move('e4');

      expect(result.san).toBe('e4');
      expect(result.fenBefore).toBe(STARTING_FEN);
      // chess.js normalizes en passant - removes if no capture possible
      expect(result.fenAfter).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    });

    it('handles captures', () => {
      const pos = ChessPosition.fromFen(
        'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2',
      );
      const result = pos.move('exd5');

      expect(result.san).toBe('exd5');
      expect(result.fenAfter).toContain('3P4');
    });

    it('handles castling kingside', () => {
      const pos = ChessPosition.fromFen('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
      const result = pos.move('O-O');

      expect(result.san).toBe('O-O');
      expect(result.fenAfter).toContain('R4RK1');
    });

    it('handles castling queenside', () => {
      const pos = ChessPosition.fromFen('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
      const result = pos.move('O-O-O');

      expect(result.san).toBe('O-O-O');
      expect(result.fenAfter).toContain('2KR3R');
    });

    it('handles pawn promotion', () => {
      const pos = ChessPosition.fromFen('8/P7/8/8/8/8/8/K6k w - - 0 1');
      const result = pos.move('a8=Q');

      // chess.js includes check indicator in SAN
      expect(result.san).toBe('a8=Q+');
      expect(result.fenAfter).toContain('Q7');
    });

    it('handles en passant', () => {
      const pos = ChessPosition.fromFen(
        'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3',
      );
      const result = pos.move('exf6');

      expect(result.san).toBe('exf6');
    });

    it('throws IllegalMoveError for illegal moves', () => {
      const pos = ChessPosition.startingPosition();

      expect(() => pos.move('e5')).toThrow(IllegalMoveError);
      expect(() => pos.move('Nf6')).toThrow(IllegalMoveError);
      expect(() => pos.move('invalid')).toThrow(IllegalMoveError);
    });
  });

  describe('isLegalMove', () => {
    it('returns true for legal moves', () => {
      const pos = ChessPosition.startingPosition();

      expect(pos.isLegalMove('e4')).toBe(true);
      expect(pos.isLegalMove('Nf3')).toBe(true);
      expect(pos.isLegalMove('d4')).toBe(true);
    });

    it('returns false for illegal moves', () => {
      const pos = ChessPosition.startingPosition();

      expect(pos.isLegalMove('e5')).toBe(false);
      expect(pos.isLegalMove('Nf6')).toBe(false);
      expect(pos.isLegalMove('invalid')).toBe(false);
    });
  });

  describe('getLegalMoves', () => {
    it('returns all legal moves from starting position', () => {
      const pos = ChessPosition.startingPosition();
      const moves = pos.getLegalMoves();

      // 20 legal moves in starting position
      expect(moves.length).toBe(20);
      expect(moves).toContain('e4');
      expect(moves).toContain('Nf3');
    });

    it('returns empty array in checkmate', () => {
      // Fool's mate position after checkmate
      const pos = ChessPosition.fromFen(
        'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
      );
      const moves = pos.getLegalMoves();

      expect(moves.length).toBe(0);
    });
  });

  describe('turn', () => {
    it('returns correct turn', () => {
      const pos = ChessPosition.startingPosition();
      expect(pos.turn()).toBe('w');

      pos.move('e4');
      expect(pos.turn()).toBe('b');
    });
  });

  describe('moveNumber', () => {
    it('returns correct move number', () => {
      const pos = ChessPosition.startingPosition();
      expect(pos.moveNumber()).toBe(1);

      pos.move('e4');
      expect(pos.moveNumber()).toBe(1);

      pos.move('e5');
      expect(pos.moveNumber()).toBe(2);
    });
  });

  describe('game state detection', () => {
    it('detects check', () => {
      const pos = ChessPosition.fromFen(
        'rnbqkbnr/pppp1ppp/8/4p3/5PP1/8/PPPPP2P/RNBQKBNR b KQkq - 0 2',
      );
      pos.move('Qh4');
      expect(pos.isCheck()).toBe(true);
    });

    it('detects checkmate', () => {
      // Fool's mate
      const pos = ChessPosition.fromFen(
        'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
      );
      expect(pos.isCheckmate()).toBe(true);
    });

    it('detects stalemate', () => {
      // Classic stalemate position - black king trapped with no moves
      const pos = ChessPosition.fromFen('k7/2Q5/1K6/8/8/8/8/8 b - - 0 1');
      expect(pos.isStalemate()).toBe(true);
    });

    it('detects game over', () => {
      const checkmatePos = ChessPosition.fromFen(
        'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
      );
      expect(checkmatePos.isGameOver()).toBe(true);

      const stalematePos = ChessPosition.fromFen('k7/8/1K6/8/8/8/8/8 b - - 0 1');
      expect(stalematePos.isGameOver()).toBe(true);
    });
  });

  describe('clone', () => {
    it('creates independent copy', () => {
      const pos1 = ChessPosition.startingPosition();
      const pos2 = pos1.clone();

      pos1.move('e4');

      expect(pos1.fen()).not.toBe(pos2.fen());
      expect(pos2.fen()).toBe(STARTING_FEN);
    });
  });

  describe('getPiece', () => {
    it('returns piece at occupied square', () => {
      const pos = ChessPosition.startingPosition();

      const whiteKing = pos.getPiece('e1');
      expect(whiteKing).toEqual({ type: 'k', color: 'w' });

      const blackQueen = pos.getPiece('d8');
      expect(blackQueen).toEqual({ type: 'q', color: 'b' });

      const whitePawn = pos.getPiece('e2');
      expect(whitePawn).toEqual({ type: 'p', color: 'w' });
    });

    it('returns undefined for empty square', () => {
      const pos = ChessPosition.startingPosition();

      expect(pos.getPiece('e4')).toBeUndefined();
      expect(pos.getPiece('d5')).toBeUndefined();
    });
  });

  describe('isSquareAttacked', () => {
    it('detects attacked squares in starting position', () => {
      const pos = ChessPosition.startingPosition();

      // d3 is attacked by white pawn on e2 (and d2)
      expect(pos.isSquareAttacked('e3', 'w')).toBe(true);

      // e4 is not attacked by black in starting position
      expect(pos.isSquareAttacked('e4', 'b')).toBe(false);
    });

    it('detects knight attacks', () => {
      // Position with knight on e4
      const pos = ChessPosition.fromFen('8/8/8/8/4N3/8/8/K6k w - - 0 1');

      expect(pos.isSquareAttacked('f6', 'w')).toBe(true);
      expect(pos.isSquareAttacked('d6', 'w')).toBe(true);
      expect(pos.isSquareAttacked('g5', 'w')).toBe(true);
      expect(pos.isSquareAttacked('e5', 'w')).toBe(false);
    });
  });

  describe('getAttackers', () => {
    it('returns attacking squares', () => {
      // Position with white knight on f3 attacking e5
      const pos = ChessPosition.fromFen('8/8/8/4p3/8/5N2/8/K6k w - - 0 1');

      const attackers = pos.getAttackers('e5', 'w');
      expect(attackers).toContain('f3'); // Knight on f3 attacks e5
    });

    it('returns empty array for unattacked square', () => {
      const pos = ChessPosition.startingPosition();

      const attackers = pos.getAttackers('e4', 'b');
      expect(attackers).toEqual([]);
    });
  });

  describe('getAllPieces', () => {
    it('returns all pieces in starting position', () => {
      const pos = ChessPosition.startingPosition();

      const pieces = pos.getAllPieces();

      // 32 pieces in starting position
      expect(pieces).toHaveLength(32);

      // Check for specific pieces
      expect(pieces).toContainEqual({ square: 'e1', type: 'k', color: 'w' });
      expect(pieces).toContainEqual({ square: 'e8', type: 'k', color: 'b' });
      expect(pieces).toContainEqual({ square: 'd1', type: 'q', color: 'w' });
    });

    it('returns fewer pieces after captures', () => {
      // Position after several captures
      const pos = ChessPosition.fromFen('8/8/8/4k3/8/8/8/4K3 w - - 0 1');

      const pieces = pos.getAllPieces();
      expect(pieces).toHaveLength(2); // Just two kings
    });
  });
});
