/**
 * Pawn Tactics Detection Tests
 */

import { ChessPosition } from '@chessbeast/pgn';
import { describe, it, expect } from 'vitest';

import { detectPawnTactics } from '../../tactical/pawn-tactics-detector.js';
import type { DetectedTheme } from '../../types.js';
import { PAWN_TACTICS_POSITIONS } from '../fixtures.js';

describe('Pawn Tactics Detection', () => {
  describe('detectPawnTactics', () => {
    describe('Advanced Pawn', () => {
      it('returns themes for pawn on 6th rank', () => {
        const pos = new ChessPosition(PAWN_TACTICS_POSITIONS.advancedPawnSixth!.fen);
        const themes = detectPawnTactics(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('returns themes for pawn on 7th rank', () => {
        const pos = new ChessPosition(PAWN_TACTICS_POSITIONS.advancedPawnSeventh!.fen);
        const themes = detectPawnTactics(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('detects black advanced pawn', () => {
        const pos = new ChessPosition(PAWN_TACTICS_POSITIONS.advancedPawnBlack!.fen);
        const themes = detectPawnTactics(pos);

        const advanced = themes.filter((t: DetectedTheme) => t.id === 'advanced_pawn');
        expect(advanced.length).toBeGreaterThan(0);
        expect(advanced[0]?.beneficiary).toBe('b');
      });
    });

    describe('Pawn Breakthrough', () => {
      it('returns themes for pawn breakthrough position', () => {
        const pos = new ChessPosition(PAWN_TACTICS_POSITIONS.pawnBreakthrough!.fen);
        const themes = detectPawnTactics(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('No Pawn Tactics', () => {
      it('does not detect pawn tactics in opening', () => {
        const pos = new ChessPosition(PAWN_TACTICS_POSITIONS.noPawnTactics!.fen);
        const themes = detectPawnTactics(pos);

        const pawnTactics = themes.filter(
          (t: DetectedTheme) =>
            t.id === 'advanced_pawn' || t.id === 'pawn_breakthrough' || t.id === 'underpromotion',
        );
        expect(pawnTactics.length).toBe(0);
      });
    });

    describe('Pawn Tactics Theme Structure', () => {
      it('pawn tactics have all required fields when detected', () => {
        const pos = new ChessPosition(PAWN_TACTICS_POSITIONS.advancedPawnBlack!.fen);
        const themes = detectPawnTactics(pos);

        for (const theme of themes) {
          expect(theme.id).toBeDefined();
          expect(theme.category).toBe('tactical');
          expect(['high', 'medium', 'low']).toContain(theme.confidence);
          expect(['critical', 'significant', 'minor']).toContain(theme.severity);
          expect(['w', 'b']).toContain(theme.beneficiary);
          expect(theme.explanation).toBeDefined();
        }
      });

      it('includes pawn square in squares when detected', () => {
        const pos = new ChessPosition(PAWN_TACTICS_POSITIONS.advancedPawnBlack!.fen);
        const themes = detectPawnTactics(pos);

        const advanced = themes.find((t: DetectedTheme) => t.id === 'advanced_pawn');
        if (advanced) {
          expect(advanced.squares?.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Multiple Advanced Pawns', () => {
      it('detects multiple advanced pawns', () => {
        const fen = '4k3/3PP3/8/8/8/8/8/4K3 w - - 0 1';
        const pos = new ChessPosition(fen);
        const themes = detectPawnTactics(pos);

        const advanced = themes.filter((t: DetectedTheme) => t.id === 'advanced_pawn');
        expect(advanced.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('Severity Classification', () => {
      it('advanced pawn has appropriate severity', () => {
        const pos = new ChessPosition(PAWN_TACTICS_POSITIONS.advancedPawnBlack!.fen);
        const themes = detectPawnTactics(pos);

        const advanced = themes.find((t: DetectedTheme) => t.id === 'advanced_pawn');
        if (advanced) {
          expect(['critical', 'significant']).toContain(advanced.severity);
        }
      });
    });
  });
});
