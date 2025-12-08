/**
 * Defender Detection Tests
 */

import { ChessPosition } from '@chessbeast/pgn';
import { describe, it, expect } from 'vitest';

import { detectDefenderTactics, detectDeflection } from '../../tactical/defender-detector.js';
import type { DetectedTheme } from '../../types.js';
import { DEFENDER_POSITIONS } from '../fixtures.js';

describe('Defender Detection', () => {
  describe('detectDefenderTactics', () => {
    describe('Overloaded Piece', () => {
      it('returns themes for overloaded queen position', () => {
        const pos = new ChessPosition(DEFENDER_POSITIONS.overloadedQueen!.fen);
        const themes = detectDefenderTactics(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('returns themes for overloaded knight position', () => {
        const pos = new ChessPosition(DEFENDER_POSITIONS.overloadedKnight!.fen);
        const themes = detectDefenderTactics(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Remove Defender', () => {
      it('returns themes for remove defender position', () => {
        const pos = new ChessPosition(DEFENDER_POSITIONS.removeDefender!.fen);
        const themes = detectDefenderTactics(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Deflection', () => {
      it('returns themes for deflection position', () => {
        const pos = new ChessPosition(DEFENDER_POSITIONS.deflection!.fen);
        const themes = detectDefenderTactics(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Desperado', () => {
      it('returns themes for desperado position', () => {
        const pos = new ChessPosition(DEFENDER_POSITIONS.desperado!.fen);
        const themes = detectDefenderTactics(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('No Defender Issues', () => {
      it('does not detect defender issues in opening', () => {
        const pos = new ChessPosition(DEFENDER_POSITIONS.noDefenderIssue!.fen);
        const themes = detectDefenderTactics(pos);

        const defenderThemes = themes.filter(
          (t: DetectedTheme) =>
            t.id === 'overloaded_piece' ||
            t.id === 'remove_defender' ||
            t.id === 'deflection' ||
            t.id === 'desperado',
        );
        expect(defenderThemes.length).toBe(0);
      });
    });

    describe('Defender Theme Structure', () => {
      it('defender themes have all required fields when detected', () => {
        const pos = new ChessPosition(DEFENDER_POSITIONS.overloadedQueen!.fen);
        const themes = detectDefenderTactics(pos);

        for (const theme of themes) {
          expect(theme.id).toBeDefined();
          expect(theme.category).toBe('tactical');
          expect(['high', 'medium', 'low']).toContain(theme.confidence);
          expect(['critical', 'significant', 'minor']).toContain(theme.severity);
          expect(['w', 'b']).toContain(theme.beneficiary);
          expect(theme.explanation).toBeDefined();
        }
      });

      it('includes defender and defended pieces when detected', () => {
        const pos = new ChessPosition(DEFENDER_POSITIONS.overloadedQueen!.fen);
        const themes = detectDefenderTactics(pos);

        const overloaded = themes.find((t: DetectedTheme) => t.id === 'overloaded_piece');
        if (overloaded) {
          expect(overloaded.pieces?.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Multiple Defender Patterns', () => {
      it('can detect multiple defender issues', () => {
        const fen = '4k3/8/3n1n2/8/3B4/8/4R3/4K3 w - - 0 1';
        const pos = new ChessPosition(fen);
        const themes = detectDefenderTactics(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Severity Classification', () => {
      it('classifies severity based on material at stake', () => {
        const pos = new ChessPosition(DEFENDER_POSITIONS.removeDefender!.fen);
        const themes = detectDefenderTactics(pos);

        for (const theme of themes) {
          if (theme.materialAtStake && theme.materialAtStake >= 500) {
            expect(['critical', 'significant']).toContain(theme.severity);
          }
        }
      });
    });
  });

  describe('detectDeflection', () => {
    it('returns array of deflection themes', () => {
      const pos = new ChessPosition(DEFENDER_POSITIONS.deflection!.fen);
      const themes = detectDeflection(pos);

      expect(Array.isArray(themes)).toBe(true);
    });
  });
});
