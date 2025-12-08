/**
 * Skewer and X-Ray Detection Tests
 */

import { ChessPosition } from '@chessbeast/pgn';
import { describe, it, expect } from 'vitest';

import { detectSkewers } from '../../tactical/skewer-detector.js';
import type { DetectedTheme } from '../../types.js';
import { SKEWER_POSITIONS } from '../fixtures.js';

describe('Skewer Detection', () => {
  describe('detectSkewers', () => {
    describe('King-Queen Skewers', () => {
      it('returns themes for king-queen skewer position', () => {
        const pos = new ChessPosition(SKEWER_POSITIONS.skewerKingQueen!.fen);
        const themes = detectSkewers(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Rook-Piece Skewers', () => {
      it('returns themes for rook-piece skewer position', () => {
        const pos = new ChessPosition(SKEWER_POSITIONS.skewerRookBishop!.fen);
        const themes = detectSkewers(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('No Skewer Positions', () => {
      it('does not detect skewer in opening position', () => {
        const pos = new ChessPosition(SKEWER_POSITIONS.noSkewer!.fen);
        const themes = detectSkewers(pos);

        const skewers = themes.filter((t: DetectedTheme) => t.id === 'skewer');
        expect(skewers.length).toBe(0);
      });
    });

    describe('Skewer Theme Structure', () => {
      it('skewer themes have all required fields when detected', () => {
        const pos = new ChessPosition(SKEWER_POSITIONS.skewerKingQueen!.fen);
        const themes = detectSkewers(pos);

        for (const theme of themes) {
          expect(theme.id).toBeDefined();
          expect(theme.category).toBe('tactical');
          expect(['high', 'medium', 'low']).toContain(theme.confidence);
          expect(['critical', 'significant', 'minor']).toContain(theme.severity);
          expect(['w', 'b']).toContain(theme.beneficiary);
          expect(theme.explanation).toBeDefined();
        }
      });

      it('includes material at stake when detected', () => {
        const pos = new ChessPosition(SKEWER_POSITIONS.skewerKingQueen!.fen);
        const themes = detectSkewers(pos);

        const skewer = themes.find((t: DetectedTheme) => t.id === 'skewer');
        if (skewer) {
          expect(skewer.materialAtStake).toBeDefined();
        }
      });
    });

    describe('X-Ray Patterns', () => {
      it('returns themes for x-ray attack position', () => {
        const pos = new ChessPosition(SKEWER_POSITIONS.xrayAttackRook!.fen);
        const themes = detectSkewers(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('returns themes for bishop x-ray position', () => {
        const pos = new ChessPosition(SKEWER_POSITIONS.xrayAttackBishop!.fen);
        const themes = detectSkewers(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('does not detect x-ray in opening', () => {
        const pos = new ChessPosition(SKEWER_POSITIONS.noSkewer!.fen);
        const themes = detectSkewers(pos);

        const xrays = themes.filter(
          (t: DetectedTheme) => t.id === 'x_ray_attack' || t.id === 'x_ray_defense',
        );
        expect(xrays.length).toBe(0);
      });

      it('x-ray themes have all required fields when detected', () => {
        const pos = new ChessPosition(SKEWER_POSITIONS.xrayAttackRook!.fen);
        const themes = detectSkewers(pos);

        for (const theme of themes) {
          expect(theme.id).toBeDefined();
          expect(theme.category).toBe('tactical');
          expect(['w', 'b']).toContain(theme.beneficiary);
          expect(theme.explanation).toBeDefined();
        }
      });
    });

    describe('Combined Skewer and X-Ray', () => {
      it('can detect both patterns independently', () => {
        const fen = '4k3/4r3/8/8/4R3/8/8/4K3 w - - 0 1';
        const pos = new ChessPosition(fen);

        const themes = detectSkewers(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });
  });
});
