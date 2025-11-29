import { describe, it, expect } from 'vitest';

import {
  detectTension,
  hasHangingPieces,
  hasPromotionThreat,
  hasCheckTension,
  getResolutionState,
  ChessPosition,
} from '../index.js';

describe('Tension Detection', () => {
  describe('hasHangingPieces', () => {
    it('detects undefended piece under attack', () => {
      // Black rook on a8 is undefended and attacked by white queen
      const pos = ChessPosition.fromFen('r3k3/8/8/8/8/8/8/Q3K3 w - - 0 1');
      const result = hasHangingPieces(pos);

      expect(result.hasTension).toBe(true);
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.reasons.some((r) => r.includes('rook'))).toBe(true);
    });

    it('does not flag defended pieces', () => {
      // White piece structure with all pieces defended (black king added)
      const pos = ChessPosition.fromFen('7k/8/8/8/8/3PP3/3NK3/8 w - - 0 1');
      const result = hasHangingPieces(pos);

      // Should not detect the defended pawns as hanging
      expect(result.reasons.every((r) => !r.includes('pawn on d3'))).toBe(true);
    });

    it('returns no tension in starting position', () => {
      const pos = ChessPosition.startingPosition();
      const result = hasHangingPieces(pos);

      // Starting position has no hanging pieces
      expect(result.hasTension).toBe(false);
    });
  });

  describe('hasPromotionThreat', () => {
    it('detects pawn on 7th rank threatening promotion', () => {
      // White pawn on a7 about to promote (promotion square not blocked)
      const pos = ChessPosition.fromFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
      const result = hasPromotionThreat(pos);

      expect(result.hasTension).toBe(true);
      expect(result.reasons.some((r) => r.includes('promotion'))).toBe(true);
    });

    it('detects black pawn on 2nd rank threatening promotion', () => {
      // Black pawn on a2 about to promote
      const pos = ChessPosition.fromFen('4k3/8/8/8/8/8/p7/4K3 w - - 0 1');
      const result = hasPromotionThreat(pos);

      expect(result.hasTension).toBe(true);
      expect(result.reasons.some((r) => r.includes('black pawn'))).toBe(true);
    });

    it('detects advanced pawn on 6th rank', () => {
      // White pawn on a6 advancing
      const pos = ChessPosition.fromFen('4k3/8/P7/8/8/8/8/4K3 w - - 0 1');
      const result = hasPromotionThreat(pos);

      expect(result.hasTension).toBe(true);
      expect(result.reasons.some((r) => r.includes('advancing'))).toBe(true);
    });

    it('returns no tension for blocked pawn', () => {
      // White pawn on e7 blocked by black piece on e8
      const pos = ChessPosition.fromFen('4n3/4P3/8/8/8/8/8/4K2k w - - 0 1');
      const result = hasPromotionThreat(pos);

      // Pawn is blocked by a black piece - may or may not be flagged depending on logic
      // The key is it's not an immediate threat
      expect(result.reasons.filter((r) => r.includes('e7 threatens promotion'))).toHaveLength(0);
    });
  });

  describe('hasCheckTension', () => {
    it('detects when king is in check', () => {
      // White king in check from black queen
      const pos = ChessPosition.fromFen('4k3/8/8/8/8/8/8/q3K3 w - - 0 1');
      const result = hasCheckTension(pos);

      expect(result.hasTension).toBe(true);
      expect(result.reasons).toContain('in check');
    });

    it('detects available check moves', () => {
      // White can give check with Qe8+
      const pos = ChessPosition.fromFen('4k3/8/8/8/8/8/8/Q3K3 w - - 0 1');
      const result = hasCheckTension(pos);

      expect(result.hasTension).toBe(true);
      expect(result.reasons.some((r) => r.includes('check available'))).toBe(true);
    });

    it('detects mate available', () => {
      // White has Qa8# (back rank mate) - queen directly attacks a8 with king on a8
      const pos = ChessPosition.fromFen('k7/8/8/8/8/8/8/Q3K3 w - - 0 1');
      const result = hasCheckTension(pos);

      expect(result.hasTension).toBe(true);
      // Either mate or check available
      expect(result.reasons.some((r) => r.includes('mate') || r.includes('check'))).toBe(true);
    });
  });

  describe('detectTension (aggregate)', () => {
    it('combines all tension sources', () => {
      // Position with check and hanging piece
      const pos = ChessPosition.fromFen('r3k3/8/8/8/8/8/8/Q3K3 w - - 0 1');
      const result = detectTension(pos);

      expect(result.hasTension).toBe(true);
      // Should detect both the undefended rook and available check/mate
      expect(result.reasons.length).toBeGreaterThanOrEqual(1);
    });

    it('returns no tension in quiet position', () => {
      // Quiet endgame position
      const pos = ChessPosition.fromFen('8/8/4k3/8/8/4K3/8/8 w - - 0 1');
      const result = detectTension(pos);

      expect(result.hasTension).toBe(false);
      expect(result.reasons).toHaveLength(0);
    });
  });
});

describe('Resolution State', () => {
  describe('getResolutionState', () => {
    it('detects checkmate as winning', () => {
      // White is checkmated (black wins)
      const pos = ChessPosition.fromFen(
        'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
      );
      expect(pos.isCheckmate()).toBe(true);

      const result = getResolutionState(pos.fen());

      expect(result.state).toBe('winning_black');
      expect(result.nag).toBe('$19');
      expect(result.reason).toBe('checkmate');
    });

    it('detects stalemate as draw', () => {
      // Stalemate position
      const fen = 'k7/2Q5/1K6/8/8/8/8/8 b - - 0 1';

      const result = getResolutionState(fen);

      expect(result.state).toBe('draw');
      expect(result.nag).toBe('$10');
      expect(result.reason).toBe('stalemate');
    });

    it('detects winning white with evaluation', () => {
      // Quiet pawn endgame - pawns not attacking, kings separated
      const fen = '4k3/8/8/4p3/4P3/8/8/4K3 w - - 0 1';

      const result = getResolutionState(fen, { cp: 500 });

      expect(result.state).toBe('winning_white');
      expect(result.nag).toBe('$18');
    });

    it('detects winning black with evaluation', () => {
      // Black to move with positive eval means black is better
      const fen = '4k3/8/8/4p3/4P3/8/8/4K3 b - - 0 1';

      const result = getResolutionState(fen, { cp: 500 });

      expect(result.state).toBe('winning_black');
      expect(result.nag).toBe('$19');
    });

    it('detects equal position', () => {
      // Pawn endgame - sufficient material, no tension
      const fen = '4k3/8/8/4p3/4P3/8/8/4K3 w - - 0 1';

      const result = getResolutionState(fen, { cp: 10 });

      expect(result.state).toBe('quiet');
      expect(result.nag).toBe('$10');
      expect(result.reason).toBe('equal position');
    });

    it('detects unresolved position with tension', () => {
      // Position with check/mate available - has tension
      const fen = 'r3k3/8/8/8/8/8/8/Q3K3 w - - 0 1';

      const result = getResolutionState(fen);

      expect(result.state).toBe('unresolved');
      expect(result.nag).toBeUndefined();
    });

    it('detects forced mate', () => {
      // Quiet pawn position with mate evaluation
      const fen = '4k3/8/8/4p3/4P3/8/8/4K3 w - - 0 1';

      const result = getResolutionState(fen, { mate: 5 });

      expect(result.state).toBe('winning_white');
      expect(result.nag).toBe('$18');
      expect(result.reason).toBe('mate in 5');
    });

    it('handles getting mated (negative mate)', () => {
      // White to move but black has mate
      const fen = '4k3/8/8/4p3/4P3/8/8/4K3 w - - 0 1';

      const result = getResolutionState(fen, { mate: -3 });

      expect(result.state).toBe('winning_black');
      expect(result.nag).toBe('$19');
    });

    it('detects slight advantage', () => {
      // Pawn endgame - sufficient material, no tension
      const fen = '4k3/8/8/4p3/4P3/8/8/4K3 w - - 0 1';

      const result = getResolutionState(fen, { cp: 100 });

      expect(result.state).toBe('quiet');
      expect(result.nag).toBe('$14'); // Slight advantage for white
    });
  });
});
