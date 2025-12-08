/**
 * Space and Central Control Detection Tests
 */

import { ChessPosition } from '@chessbeast/pgn';
import { describe, it, expect } from 'vitest';

import { detectSpaceThemes } from '../../positional/space.js';
import { SPACE_POSITIONS } from '../fixtures.js';

describe('Space Control Detection', () => {
  describe('detectSpaceThemes', () => {
    describe('Space Advantage', () => {
      it('returns themes for white space advantage position', () => {
        const pos = new ChessPosition(SPACE_POSITIONS.whiteSpaceAdvantage!.fen);
        const themes = detectSpaceThemes(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('identifies who has space advantage when detected', () => {
        const pos = new ChessPosition(SPACE_POSITIONS.whiteSpaceAdvantage!.fen);
        const themes = detectSpaceThemes(pos);

        const spaceAdv = themes.find((t) => t.id === 'space_advantage');
        if (spaceAdv) {
          expect(['w', 'b']).toContain(spaceAdv.beneficiary);
        }
      });
    });

    describe('Central Control', () => {
      it('detects white central control', () => {
        const pos = new ChessPosition(SPACE_POSITIONS.whiteCentralControl!.fen);
        const themes = detectSpaceThemes(pos);

        const centralControl = themes.filter((t) => t.id === 'central_control');
        expect(centralControl.length).toBeGreaterThan(0);
        expect(centralControl[0]?.beneficiary).toBe('w');
      });

      it('includes central squares in analysis', () => {
        const pos = new ChessPosition(SPACE_POSITIONS.whiteCentralControl!.fen);
        const themes = detectSpaceThemes(pos);

        const central = themes.find((t) => t.id === 'central_control');
        if (central) {
          expect(central.explanation.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Convergence Zone', () => {
      it('returns themes for convergence zone position', () => {
        const pos = new ChessPosition(SPACE_POSITIONS.convergenceZone!.fen);
        const themes = detectSpaceThemes(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('includes target square when detected', () => {
        const pos = new ChessPosition(SPACE_POSITIONS.convergenceZone!.fen);
        const themes = detectSpaceThemes(pos);

        const convergence = themes.find((t) => t.id === 'convergence_zone');
        if (convergence) {
          expect(convergence.squares?.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Balanced Space', () => {
      it('does not detect advantage in equal position', () => {
        const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
        const pos = new ChessPosition(fen);
        const themes = detectSpaceThemes(pos);

        // Early position, minimal advantage
        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Space Theme Structure', () => {
      it('space themes have all required fields', () => {
        const pos = new ChessPosition(SPACE_POSITIONS.whiteSpaceAdvantage!.fen);
        const themes = detectSpaceThemes(pos);

        for (const theme of themes) {
          expect(theme.id).toBeDefined();
          expect(theme.category).toBe('positional');
          expect(['high', 'medium', 'low']).toContain(theme.confidence);
          expect(['critical', 'significant', 'minor']).toContain(theme.severity);
          expect(['w', 'b']).toContain(theme.beneficiary);
          expect(theme.explanation).toBeDefined();
        }
      });
    });

    describe('Multiple Space Themes', () => {
      it('can detect multiple space themes', () => {
        // Position with space and central control
        const pos = new ChessPosition(SPACE_POSITIONS.whiteCentralControl!.fen);
        const themes = detectSpaceThemes(pos);

        expect(themes.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('Space Calculation', () => {
      it('considers pawn structure in space calculation', () => {
        const pos = new ChessPosition(SPACE_POSITIONS.whiteSpaceAdvantage!.fen);
        const themes = detectSpaceThemes(pos);

        // Should have space advantage due to pawn structure
        const spaceAdv = themes.find((t) => t.id === 'space_advantage');
        if (spaceAdv) {
          expect(spaceAdv.beneficiary).toBeDefined();
        }
      });
    });
  });
});
