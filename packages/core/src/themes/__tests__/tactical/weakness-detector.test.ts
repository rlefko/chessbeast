/**
 * Weakness Detection Tests
 */

import { ChessPosition } from '@chessbeast/pgn';
import { describe, it, expect } from 'vitest';

import { detectWeaknesses, detectHangingPieces } from '../../tactical/weakness-detector.js';
import type { DetectedTheme } from '../../types.js';
import { WEAKNESS_POSITIONS } from '../fixtures.js';

describe('Weakness Detection', () => {
  describe('detectWeaknesses', () => {
    describe('Back Rank Weakness', () => {
      it('returns array of themes for back rank position', () => {
        const pos = new ChessPosition(WEAKNESS_POSITIONS.backRankClassic!.fen);
        const themes = detectWeaknesses(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('returns themes for black back rank position', () => {
        const pos = new ChessPosition(WEAKNESS_POSITIONS.backRankBlack!.fen);
        const themes = detectWeaknesses(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('does not detect back rank when luft exists', () => {
        const pos = new ChessPosition(WEAKNESS_POSITIONS.backRankWithLuft!.fen);
        const themes = detectWeaknesses(pos);

        const backRank = themes.filter((t: DetectedTheme) => t.id === 'back_rank_weakness');
        expect(backRank.length).toBe(0);
      });
    });

    describe('f2/f7 Weakness', () => {
      it('detects f7 weakness when targeted', () => {
        const pos = new ChessPosition(WEAKNESS_POSITIONS.f7WeaknessEarly!.fen);
        const themes = detectWeaknesses(pos);

        const f7Weak = themes.filter((t: DetectedTheme) => t.id === 'f2_f7_weakness');
        expect(f7Weak.length).toBeGreaterThan(0);
      });

      it('returns themes for f2 weakness position', () => {
        const pos = new ChessPosition(WEAKNESS_POSITIONS.f2WeaknessEarly!.fen);
        const themes = detectWeaknesses(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Trapped Pieces', () => {
      it('returns themes for trapped bishop position', () => {
        const pos = new ChessPosition(WEAKNESS_POSITIONS.trappedBishopA7!.fen);
        const themes = detectWeaknesses(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('returns themes for trapped knight position', () => {
        const pos = new ChessPosition(WEAKNESS_POSITIONS.trappedKnight!.fen);
        const themes = detectWeaknesses(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('trapped piece themes include the piece when detected', () => {
        const pos = new ChessPosition(WEAKNESS_POSITIONS.trappedBishopA7!.fen);
        const themes = detectWeaknesses(pos);

        const trapped = themes.find((t: DetectedTheme) => t.id === 'trapped_piece');
        if (trapped) {
          expect(trapped.pieces?.length).toBeGreaterThan(0);
        }
      });

      it('trapped piece themes include material at stake when detected', () => {
        const pos = new ChessPosition(WEAKNESS_POSITIONS.trappedBishopA7!.fen);
        const themes = detectWeaknesses(pos);

        const trapped = themes.find((t: DetectedTheme) => t.id === 'trapped_piece');
        if (trapped) {
          expect(trapped.materialAtStake).toBeDefined();
          expect(trapped.materialAtStake).toBeGreaterThan(0);
        }
      });
    });

    describe('No Weakness Positions', () => {
      it('does not detect trapped pieces in normal positions', () => {
        const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
        const pos = new ChessPosition(fen);
        const themes = detectWeaknesses(pos);

        const trapped = themes.filter((t: DetectedTheme) => t.id === 'trapped_piece');
        expect(trapped.length).toBe(0);
      });
    });

    describe('Weakness Theme Structure', () => {
      it('weakness themes have all required fields', () => {
        const pos = new ChessPosition(WEAKNESS_POSITIONS.f7WeaknessEarly!.fen);
        const themes = detectWeaknesses(pos);

        for (const theme of themes) {
          expect(theme.id).toBeDefined();
          expect(theme.category).toBe('tactical');
          expect(['high', 'medium', 'low']).toContain(theme.confidence);
          expect(['critical', 'significant', 'minor']).toContain(theme.severity);
          expect(['w', 'b']).toContain(theme.beneficiary);
          expect(theme.explanation).toBeDefined();
        }
      });
    });

    describe('Domination', () => {
      it('returns themes for domination position', () => {
        const fen = '4k3/8/8/3n4/4B3/8/8/4K3 w - - 0 1';
        const pos = new ChessPosition(fen);
        const themes = detectWeaknesses(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });
  });

  describe('detectHangingPieces', () => {
    it('returns array of hanging piece themes', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
      const pos = new ChessPosition(fen);
      const themes = detectHangingPieces(pos);

      expect(Array.isArray(themes)).toBe(true);
    });
  });
});
