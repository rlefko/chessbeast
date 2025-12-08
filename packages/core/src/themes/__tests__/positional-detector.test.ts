/**
 * Positional Theme Detection Tests
 *
 * Basic tests to verify positional pattern detection
 */

import { ChessPosition } from '@chessbeast/pgn';
import { describe, it, expect } from 'vitest';

import { PositionalThemeDetector } from '../positional/index.js';

describe('PositionalThemeDetector', () => {
  const detector = new PositionalThemeDetector();

  describe('Basic Detection', () => {
    it('returns an array of themes', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
      const pos = new ChessPosition(fen);
      const themes = detector.detect(pos, { tier: 'full' });

      expect(Array.isArray(themes)).toBe(true);
    });

    it('each theme has required fields', () => {
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/3PP3/2N2N2/PPP2PPP/R1BQKB1R b KQkq - 0 4';
      const pos = new ChessPosition(fen);
      const themes = detector.detect(pos, { tier: 'full' });

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

  describe('Pawn Structure', () => {
    it('detects passed pawn', () => {
      // White pawn on d5 is passed (no black pawns can stop it)
      const fen = '4k3/8/8/3P4/8/8/8/4K3 w - - 0 1';
      const pos = new ChessPosition(fen);
      const themes = detector.detect(pos, { tier: 'full' });

      const passed = themes.filter((t) => t.id === 'passed_pawn');
      expect(passed.length).toBeGreaterThan(0);
      expect(passed[0]?.beneficiary).toBe('w');
    });

    it('handles position with multiple pawns', () => {
      const fen = 'rnbqkbnr/pppp1ppp/8/4p3/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 2';
      const pos = new ChessPosition(fen);
      const themes = detector.detect(pos, { tier: 'full' });

      // Should return some pawn structure themes
      expect(Array.isArray(themes)).toBe(true);
    });
  });

  describe('File Control', () => {
    it('handles file analysis', () => {
      // Position with open/semi-open files possible
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4';
      const pos = new ChessPosition(fen);
      const themes = detector.detect(pos, { tier: 'full' });

      // Should run without errors
      expect(Array.isArray(themes)).toBe(true);
    });
  });

  describe('Space and Control', () => {
    it('analyzes space control', () => {
      // White has significant space advantage
      const fen = 'r1bqkbnr/pppppppp/8/8/3PP3/2N2N2/PPP2PPP/R1BQKB1R b KQkq - 0 4';
      const pos = new ChessPosition(fen);
      const themes = detector.detect(pos, { tier: 'full' });

      expect(Array.isArray(themes)).toBe(true);
    });
  });

  describe('Tier Filtering', () => {
    it('full tier detects all themes', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
      const pos = new ChessPosition(fen);

      const shallowThemes = detector.detect(pos, { tier: 'shallow' });
      const fullThemes = detector.detect(pos, { tier: 'full' });

      // Full tier should detect at least as many themes
      expect(fullThemes.length).toBeGreaterThanOrEqual(shallowThemes.length);
    });
  });
});
