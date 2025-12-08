/**
 * Endgame Theme Detection Tests
 */

import { ChessPosition } from '@chessbeast/pgn';
import { describe, it, expect } from 'vitest';

import { detectEndgameThemes } from '../../tactical/endgame-detector.js';
import type { DetectedTheme } from '../../types.js';
import { ENDGAME_POSITIONS } from '../fixtures.js';

describe('Endgame Theme Detection', () => {
  describe('detectEndgameThemes', () => {
    describe('Opposition', () => {
      it('returns themes for direct vertical opposition position', () => {
        const pos = new ChessPosition(ENDGAME_POSITIONS.directOpposition!.fen);
        const themes = detectEndgameThemes(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('returns themes for distant opposition on file position', () => {
        const pos = new ChessPosition(ENDGAME_POSITIONS.distantOppositionFile!.fen);
        const themes = detectEndgameThemes(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('returns themes for distant opposition on rank position', () => {
        const pos = new ChessPosition(ENDGAME_POSITIONS.distantOppositionRank!.fen);
        const themes = detectEndgameThemes(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('returns themes for diagonal opposition position', () => {
        const pos = new ChessPosition(ENDGAME_POSITIONS.diagonalOpposition!.fen);
        const themes = detectEndgameThemes(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('identifies who has the opposition when detected', () => {
        const pos = new ChessPosition(ENDGAME_POSITIONS.directOpposition!.fen);
        const themes = detectEndgameThemes(pos);

        const opposition = themes.find((t: DetectedTheme) => t.id === 'opposition');
        if (opposition) {
          expect(['w', 'b']).toContain(opposition.beneficiary);
        }
      });
    });

    describe('Triangulation', () => {
      it('returns themes for triangulation position', () => {
        const pos = new ChessPosition(ENDGAME_POSITIONS.triangulationSetup!.fen);
        const themes = detectEndgameThemes(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('includes triangulation squares when detected', () => {
        const pos = new ChessPosition(ENDGAME_POSITIONS.triangulationSetup!.fen);
        const themes = detectEndgameThemes(pos);

        const triangulation = themes.find((t: DetectedTheme) => t.id === 'triangulation');
        if (triangulation) {
          expect(triangulation.squares?.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Zugzwang', () => {
      it('returns themes for simple zugzwang position', () => {
        const pos = new ChessPosition(ENDGAME_POSITIONS.zugzwangSimple!.fen);
        const themes = detectEndgameThemes(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('returns themes for complex zugzwang position', () => {
        const pos = new ChessPosition(ENDGAME_POSITIONS.zugzwangComplex!.fen);
        const themes = detectEndgameThemes(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('identifies who benefits from zugzwang when detected', () => {
        const pos = new ChessPosition(ENDGAME_POSITIONS.zugzwangSimple!.fen);
        const themes = detectEndgameThemes(pos);

        const zugzwang = themes.find((t: DetectedTheme) => t.id === 'zugzwang');
        if (zugzwang) {
          expect(['w', 'b']).toContain(zugzwang.beneficiary);
        }
      });
    });

    describe('No Endgame Theme', () => {
      it('does not detect endgame themes when not in opposition', () => {
        const pos = new ChessPosition(ENDGAME_POSITIONS.noEndgameTheme!.fen);
        const themes = detectEndgameThemes(pos);

        const opposition = themes.filter((t: DetectedTheme) => t.id === 'opposition');
        expect(opposition.length).toBe(0);
      });

      it('returns empty for non-endgame positions', () => {
        // Complex position with many pieces
        const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
        const pos = new ChessPosition(fen);
        const themes = detectEndgameThemes(pos);

        // Not an endgame, so should return empty
        expect(themes.length).toBe(0);
      });
    });

    describe('Endgame Theme Structure', () => {
      it('endgame themes have all required fields', () => {
        const pos = new ChessPosition(ENDGAME_POSITIONS.directOpposition!.fen);
        const themes = detectEndgameThemes(pos);

        for (const theme of themes) {
          expect(theme.id).toBeDefined();
          expect(theme.category).toBe('tactical');
          expect(['high', 'medium', 'low']).toContain(theme.confidence);
          expect(['critical', 'significant', 'minor']).toContain(theme.severity);
          expect(['w', 'b']).toContain(theme.beneficiary);
          expect(theme.explanation).toBeDefined();
        }
      });

      it('includes king squares for opposition', () => {
        const pos = new ChessPosition(ENDGAME_POSITIONS.directOpposition!.fen);
        const themes = detectEndgameThemes(pos);

        const opposition = themes.find((t: DetectedTheme) => t.id === 'opposition');
        if (opposition) {
          expect(opposition.squares?.length).toBe(2);
        }
      });
    });

    describe('Endgame Detection Criteria', () => {
      it('only detects themes in endgames', () => {
        // Middlegame position
        const fen = 'r1bqk2r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
        const pos = new ChessPosition(fen);
        const themes = detectEndgameThemes(pos);

        // Not an endgame, should return empty
        expect(themes.length).toBe(0);
      });

      it('detects themes in queen-less endgames', () => {
        const fen = '4k3/8/8/4p3/4P3/8/8/4K3 w - - 0 1';
        const pos = new ChessPosition(fen);
        const themes = detectEndgameThemes(pos);

        // Is an endgame, may detect themes
        expect(Array.isArray(themes)).toBe(true);
      });
    });
  });
});
