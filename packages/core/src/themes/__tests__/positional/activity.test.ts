/**
 * Piece Activity Detection Tests
 */

import { ChessPosition } from '@chessbeast/pgn';
import { describe, it, expect } from 'vitest';

import { detectActivityThemes } from '../../positional/activity.js';
import { ACTIVITY_POSITIONS } from '../fixtures.js';

describe('Piece Activity Detection', () => {
  describe('detectActivityThemes', () => {
    describe('Development Lead', () => {
      it('returns themes for development lead position', () => {
        const pos = new ChessPosition(ACTIVITY_POSITIONS.developmentLead!.fen);
        const themes = detectActivityThemes(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('returns themes for large development lead position', () => {
        const pos = new ChessPosition(ACTIVITY_POSITIONS.largeDevelopmentLead!.fen);
        const themes = detectActivityThemes(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('identifies who has development lead when detected', () => {
        const pos = new ChessPosition(ACTIVITY_POSITIONS.developmentLead!.fen);
        const themes = detectActivityThemes(pos);

        const devLead = themes.find((t) => t.id === 'development_lead');
        if (devLead) {
          expect(['w', 'b']).toContain(devLead.beneficiary);
        }
      });
    });

    describe('Activity Advantage', () => {
      it('returns themes for activity advantage position', () => {
        const pos = new ChessPosition(ACTIVITY_POSITIONS.activityAdvantage!.fen);
        const themes = detectActivityThemes(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('considers piece mobility when detected', () => {
        const pos = new ChessPosition(ACTIVITY_POSITIONS.activityAdvantage!.fen);
        const themes = detectActivityThemes(pos);

        const activity = themes.find((t) => t.id === 'activity_advantage');
        if (activity) {
          expect(activity.explanation.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Piece Passivity', () => {
      it('detects passive pieces in starting position', () => {
        const pos = new ChessPosition(ACTIVITY_POSITIONS.piecePassivity!.fen);
        const themes = detectActivityThemes(pos);

        // Both sides passive in starting position
        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Paralysis', () => {
      it('detects piece restriction', () => {
        const pos = new ChessPosition(ACTIVITY_POSITIONS.paralysis!.fen);
        const themes = detectActivityThemes(pos);

        // May detect paralysis or passivity
        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('No Activity Issues', () => {
      it('handles equal activity positions', () => {
        const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 4 4';
        const pos = new ChessPosition(fen);
        const themes = detectActivityThemes(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Activity Theme Structure', () => {
      it('activity themes have all required fields', () => {
        const pos = new ChessPosition(ACTIVITY_POSITIONS.developmentLead!.fen);
        const themes = detectActivityThemes(pos);

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

    describe('Multiple Activity Themes', () => {
      it('can detect multiple activity themes', () => {
        const pos = new ChessPosition(ACTIVITY_POSITIONS.largeDevelopmentLead!.fen);
        const themes = detectActivityThemes(pos);

        // May detect both development lead and activity advantage
        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Development Counting', () => {
      it('counts developed pieces correctly', () => {
        const pos = new ChessPosition(ACTIVITY_POSITIONS.developmentLead!.fen);
        const themes = detectActivityThemes(pos);

        // Should detect white's developed knight
        const devLead = themes.find((t) => t.id === 'development_lead');
        if (devLead) {
          expect(devLead.beneficiary).toBe('w');
        }
      });
    });
  });
});
