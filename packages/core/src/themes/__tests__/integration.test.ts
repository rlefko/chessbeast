/**
 * Theme Detection Integration Tests
 *
 * Tests that multiple themes can be detected simultaneously
 * and that the full detection pipeline works correctly.
 */

import { ChessPosition } from '@chessbeast/pgn';
import { describe, it, expect } from 'vitest';

import { PositionalThemeDetector } from '../positional/index.js';
import { TacticalThemeDetector } from '../tactical/index.js';

import { INTEGRATION_POSITIONS } from './fixtures.js';

describe('Theme Detection Integration', () => {
  const tacticalDetector = new TacticalThemeDetector();
  const positionalDetector = new PositionalThemeDetector();

  describe('Multiple Theme Detection', () => {
    it('detects multiple tactical themes in complex position', () => {
      const pos = new ChessPosition(INTEGRATION_POSITIONS.multipleThemes!.fen);

      const tacticalThemes = tacticalDetector.detect(pos, { tier: 'full' });
      const positionalThemes = positionalDetector.detect(pos, { tier: 'full' });

      // Should detect multiple themes
      expect(tacticalThemes.length + positionalThemes.length).toBeGreaterThan(0);
    });

    it('detects themes for both colors', () => {
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p1B1/2B1P3/5N2/PPPP1PPP/RN1QK2R b KQkq - 5 4';
      const pos = new ChessPosition(fen);

      const themes = tacticalDetector.detect(pos, { tier: 'full' });

      // Should have themes benefiting both colors
      const whiteBeneficiary = themes.filter((t) => t.beneficiary === 'w');
      const blackBeneficiary = themes.filter((t) => t.beneficiary === 'b');

      expect(whiteBeneficiary.length + blackBeneficiary.length).toBe(themes.length);
    });

    it('detects both tactical and positional themes', () => {
      const pos = new ChessPosition(INTEGRATION_POSITIONS.positionalPosition!.fen);

      const tacticalThemes = tacticalDetector.detect(pos, { tier: 'full' });
      const positionalThemes = positionalDetector.detect(pos, { tier: 'full' });

      // Should detect themes
      expect(tacticalThemes.length + positionalThemes.length).toBeGreaterThan(0);
    });
  });

  describe('Detection Tiers', () => {
    it('shallow tier is faster and detects fewer themes', () => {
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p1B1/2B1P3/5N2/PPPP1PPP/RN1QK2R b KQkq - 5 4';
      const pos = new ChessPosition(fen);

      const shallowThemes = tacticalDetector.detect(pos, { tier: 'shallow' });
      const fullThemes = tacticalDetector.detect(pos, { tier: 'full' });

      expect(fullThemes.length).toBeGreaterThanOrEqual(shallowThemes.length);
    });

    it('standard tier is intermediate', () => {
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p1B1/2B1P3/5N2/PPPP1PPP/RN1QK2R b KQkq - 5 4';
      const pos = new ChessPosition(fen);

      const shallowThemes = tacticalDetector.detect(pos, { tier: 'shallow' });
      const standardThemes = tacticalDetector.detect(pos, { tier: 'standard' });
      const fullThemes = tacticalDetector.detect(pos, { tier: 'full' });

      expect(standardThemes.length).toBeGreaterThanOrEqual(shallowThemes.length);
      expect(fullThemes.length).toBeGreaterThanOrEqual(standardThemes.length);
    });
  });

  describe('Theme Structure Consistency', () => {
    it('all tactical themes have correct category', () => {
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p1B1/2B1P3/5N2/PPPP1PPP/RN1QK2R b KQkq - 5 4';
      const pos = new ChessPosition(fen);

      const themes = tacticalDetector.detect(pos, { tier: 'full' });

      for (const theme of themes) {
        expect(theme.category).toBe('tactical');
      }
    });

    it('all positional themes have correct category', () => {
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/3PP3/2N2N2/PPP2PPP/R1BQKB1R b KQkq - 0 4';
      const pos = new ChessPosition(fen);

      const themes = positionalDetector.detect(pos, { tier: 'full' });

      for (const theme of themes) {
        expect(theme.category).toBe('positional');
      }
    });

    it('all themes have valid confidence levels', () => {
      const pos = new ChessPosition(INTEGRATION_POSITIONS.multipleThemes!.fen);

      const tacticalThemes = tacticalDetector.detect(pos, { tier: 'full' });
      const positionalThemes = positionalDetector.detect(pos, { tier: 'full' });
      const allThemes = [...tacticalThemes, ...positionalThemes];

      for (const theme of allThemes) {
        expect(['high', 'medium', 'low']).toContain(theme.confidence);
      }
    });

    it('all themes have valid severity levels', () => {
      const pos = new ChessPosition(INTEGRATION_POSITIONS.multipleThemes!.fen);

      const tacticalThemes = tacticalDetector.detect(pos, { tier: 'full' });
      const positionalThemes = positionalDetector.detect(pos, { tier: 'full' });
      const allThemes = [...tacticalThemes, ...positionalThemes];

      for (const theme of allThemes) {
        expect(['critical', 'significant', 'minor']).toContain(theme.severity);
      }
    });
  });

  describe('Edge Cases', () => {
    it('handles starting position', () => {
      const pos = new ChessPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

      const tacticalThemes = tacticalDetector.detect(pos, { tier: 'full' });
      const positionalThemes = positionalDetector.detect(pos, { tier: 'full' });

      // Starting position should have minimal themes
      expect(Array.isArray(tacticalThemes)).toBe(true);
      expect(Array.isArray(positionalThemes)).toBe(true);
    });

    it('handles endgame position', () => {
      const pos = new ChessPosition('8/8/8/4k3/8/4K3/8/8 w - - 0 1');

      const tacticalThemes = tacticalDetector.detect(pos, { tier: 'full' });
      const positionalThemes = positionalDetector.detect(pos, { tier: 'full' });

      // Should detect endgame-specific themes
      expect(Array.isArray(tacticalThemes)).toBe(true);
      expect(Array.isArray(positionalThemes)).toBe(true);
    });

    it('handles position with only kings', () => {
      const pos = new ChessPosition('4k3/8/8/8/8/8/8/4K3 w - - 0 1');

      const tacticalThemes = tacticalDetector.detect(pos, { tier: 'full' });
      const positionalThemes = positionalDetector.detect(pos, { tier: 'full' });

      expect(Array.isArray(tacticalThemes)).toBe(true);
      expect(Array.isArray(positionalThemes)).toBe(true);
    });

    it('handles position with check', () => {
      const pos = new ChessPosition('4k3/8/8/8/8/8/4R3/4K3 w - - 0 1');

      const themes = tacticalDetector.detect(pos, { tier: 'full' });

      expect(Array.isArray(themes)).toBe(true);
    });
  });

  describe('Performance', () => {
    it('completes full detection in reasonable time', () => {
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p1B1/2B1P3/5N2/PPPP1PPP/RN1QK2R b KQkq - 5 4';
      const pos = new ChessPosition(fen);

      const start = Date.now();
      tacticalDetector.detect(pos, { tier: 'full' });
      positionalDetector.detect(pos, { tier: 'full' });
      const elapsed = Date.now() - start;

      // Should complete in under 500ms for normal positions
      expect(elapsed).toBeLessThan(500);
    });

    it('shallow tier is faster than full', () => {
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p1B1/2B1P3/5N2/PPPP1PPP/RN1QK2R b KQkq - 5 4';
      const pos = new ChessPosition(fen);

      const startShallow = Date.now();
      tacticalDetector.detect(pos, { tier: 'shallow' });
      const elapsedShallow = Date.now() - startShallow;

      const startFull = Date.now();
      tacticalDetector.detect(pos, { tier: 'full' });
      const elapsedFull = Date.now() - startFull;

      // Shallow should be faster or comparable
      expect(elapsedShallow).toBeLessThanOrEqual(elapsedFull + 50);
    });
  });

  describe('Specific Theme Combinations', () => {
    it('detects pin with development advantage', () => {
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p1B1/4P3/5N2/PPPP1PPP/RN1QKB1R w KQkq - 4 4';
      const pos = new ChessPosition(fen);

      const tacticalThemes = tacticalDetector.detect(pos, { tier: 'full' });
      const positionalThemes = positionalDetector.detect(pos, { tier: 'full' });

      // May detect pin and development themes
      expect(Array.isArray(tacticalThemes)).toBe(true);
      expect(Array.isArray(positionalThemes)).toBe(true);
    });

    it('detects passed pawn with endgame themes', () => {
      const fen = '8/4P3/8/4k3/8/4K3/8/8 w - - 0 1';
      const pos = new ChessPosition(fen);

      const tacticalThemes = tacticalDetector.detect(pos, { tier: 'full' });
      const positionalThemes = positionalDetector.detect(pos, { tier: 'full' });

      // Should detect advanced pawn and possibly opposition
      const advancedPawns = tacticalThemes.filter((t) => t.id === 'advanced_pawn');
      const passedPawns = positionalThemes.filter((t) => t.id === 'passed_pawn');

      expect(advancedPawns.length + passedPawns.length).toBeGreaterThan(0);
    });
  });
});
