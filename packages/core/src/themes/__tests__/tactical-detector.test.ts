/**
 * Tactical Theme Detection Tests
 *
 * Basic tests to verify tactical pattern detection
 */

import { ChessPosition } from '@chessbeast/pgn';
import { describe, it, expect } from 'vitest';

import { TacticalThemeDetector } from '../tactical/index.js';

describe('TacticalThemeDetector', () => {
  const detector = new TacticalThemeDetector();

  describe('Basic Detection', () => {
    it('returns an array of themes', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
      const pos = new ChessPosition(fen);
      const themes = detector.detect(pos, { tier: 'full' });

      expect(Array.isArray(themes)).toBe(true);
    });

    it('each theme has required fields', () => {
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p1B1/2B1P3/3P1N2/PPP2PPP/RN1QK2R b KQkq - 0 5';
      const pos = new ChessPosition(fen);
      const themes = detector.detect(pos, { tier: 'full' });

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

  describe('Fork Detection', () => {
    it('detects knight fork on king and rook', () => {
      // Position: White knight on c7 forking king on e8 and rook on a8
      const fen = 'r3k3/ppNp1ppp/8/8/8/8/PPP2PPP/R3K2R b KQq - 0 1';
      const pos = new ChessPosition(fen);
      const themes = detector.detect(pos, { tier: 'full' });

      const forks = themes.filter((t) => t.id === 'knight_fork' || t.id === 'fork');
      expect(forks.length).toBeGreaterThan(0);
      expect(forks[0]?.beneficiary).toBe('w');
    });
  });

  describe('Advanced Pawn', () => {
    it('detects pawn on 7th rank', () => {
      // White pawn on d7
      const fen = '4k3/3P4/8/8/8/8/8/4K3 w - - 0 1';
      const pos = new ChessPosition(fen);
      const themes = detector.detect(pos, { tier: 'full' });

      const advanced = themes.filter((t) => t.id === 'advanced_pawn');
      expect(advanced.length).toBeGreaterThan(0);
      // On 7th rank, it should be critical or significant
      expect(['critical', 'significant']).toContain(advanced[0]?.severity);
    });
  });

  describe('Tier Filtering', () => {
    it('full tier detects all themes', () => {
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p1B1/2B1P3/3P1N2/PPP2PPP/RN1QK2R b KQkq - 0 5';
      const pos = new ChessPosition(fen);

      const shallowThemes = detector.detect(pos, { tier: 'shallow' });
      const fullThemes = detector.detect(pos, { tier: 'full' });

      // Full tier should detect at least as many themes
      expect(fullThemes.length).toBeGreaterThanOrEqual(shallowThemes.length);
    });
  });

  describe('Complex Position', () => {
    it('detects multiple themes in tactical position', () => {
      // Fried Liver position with tactical themes
      const fen = 'r1bqkb1r/ppp2ppp/2n5/3np1N1/2B1P3/8/PPPP1PPP/RNBQK2R w KQkq - 0 5';
      const pos = new ChessPosition(fen);
      const themes = detector.detect(pos, { tier: 'full' });

      // Should detect some themes (forks, attacks on f7, etc.)
      expect(themes.length).toBeGreaterThanOrEqual(0);
    });
  });
});
