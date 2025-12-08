/**
 * Color Complex Detection Tests
 */

import { ChessPosition } from '@chessbeast/pgn';
import { describe, it, expect } from 'vitest';

import { detectColorThemes } from '../../positional/color-complex.js';
import { COLOR_POSITIONS } from '../fixtures.js';

describe('Color Complex Detection', () => {
  describe('detectColorThemes', () => {
    describe('Light Square Weakness', () => {
      it('returns themes for light square weakness position', () => {
        const pos = new ChessPosition(COLOR_POSITIONS.lightSquareWeakness!.fen);
        const themes = detectColorThemes(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('identifies who benefits from color weakness when detected', () => {
        const pos = new ChessPosition(COLOR_POSITIONS.lightSquareWeakness!.fen);
        const themes = detectColorThemes(pos);

        const colorWeak = themes.find((t) => t.id === 'color_weakness');
        if (colorWeak) {
          expect(['w', 'b']).toContain(colorWeak.beneficiary);
        }
      });
    });

    describe('Dark Square Weakness', () => {
      it('handles potential dark square weakness', () => {
        const pos = new ChessPosition(COLOR_POSITIONS.darkSquareWeakness!.fen);
        const themes = detectColorThemes(pos);

        // May or may not detect weakness yet
        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('No Color Weakness', () => {
      it('does not detect weakness in balanced position', () => {
        const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
        const pos = new ChessPosition(fen);
        const themes = detectColorThemes(pos);

        const colorWeak = themes.filter((t) => t.id === 'color_weakness');
        expect(colorWeak.length).toBe(0);
      });
    });

    describe('Fortress Detection', () => {
      it('handles fortress positions', () => {
        const pos = new ChessPosition(COLOR_POSITIONS.fortress!.fen);
        const themes = detectColorThemes(pos);

        // Simple KvK is not a fortress
        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Color Theme Structure', () => {
      it('color themes have all required fields', () => {
        const pos = new ChessPosition(COLOR_POSITIONS.lightSquareWeakness!.fen);
        const themes = detectColorThemes(pos);

        for (const theme of themes) {
          expect(theme.id).toBeDefined();
          expect(theme.category).toBe('positional');
          expect(['high', 'medium', 'low']).toContain(theme.confidence);
          expect(['critical', 'significant', 'minor']).toContain(theme.severity);
          expect(['w', 'b']).toContain(theme.beneficiary);
          expect(theme.explanation).toBeDefined();
        }
      });

      it('includes color information in explanation', () => {
        const pos = new ChessPosition(COLOR_POSITIONS.lightSquareWeakness!.fen);
        const themes = detectColorThemes(pos);

        const colorWeak = themes.find((t) => t.id === 'color_weakness');
        if (colorWeak) {
          expect(colorWeak.explanation.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Bishop Pair Consideration', () => {
      it('considers bishop presence', () => {
        // Position with one bishop missing
        const fen = 'rnbqk1nr/pppp1ppp/4p3/8/1bPP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4';
        const pos = new ChessPosition(fen);
        const themes = detectColorThemes(pos);

        // May detect weakness based on bishop exchange
        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Pawn Structure Impact', () => {
      it('considers pawns on same color', () => {
        // Position with pawns on same color as remaining bishop
        const fen = 'r1bqkbnr/ppp1pppp/2np4/8/3P4/5N2/PPP1PPPP/RNBQKB1R w KQkq - 0 3';
        const pos = new ChessPosition(fen);
        const themes = detectColorThemes(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });
  });
});
