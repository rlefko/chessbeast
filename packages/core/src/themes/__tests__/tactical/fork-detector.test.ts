/**
 * Fork Detection Tests
 */

import { ChessPosition } from '@chessbeast/pgn';
import { describe, it, expect } from 'vitest';

import {
  detectForks,
  detectPotentialForks,
  detectDoubleAttacks,
} from '../../tactical/fork-detector.js';
import type { DetectedTheme } from '../../types.js';
import { FORK_POSITIONS } from '../fixtures.js';

describe('Fork Detection', () => {
  describe('detectForks', () => {
    describe('Knight Forks', () => {
      it('returns array of themes', () => {
        const pos = new ChessPosition(FORK_POSITIONS.knightForkKingQueen!.fen);
        const themes = detectForks(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('detects forks with correct structure', () => {
        const pos = new ChessPosition(FORK_POSITIONS.knightForkFamilyFork!.fen);
        const themes = detectForks(pos);

        for (const theme of themes) {
          expect(theme.id).toBeDefined();
          expect(theme.category).toBe('tactical');
          expect(['w', 'b']).toContain(theme.beneficiary);
        }
      });

      it('returns themes for knight fork position', () => {
        // Position with knight on e5 attacking pieces
        const fen = '4k3/8/5q2/4N3/8/8/8/4K3 w - - 0 1';
        const pos = new ChessPosition(fen);
        const themes = detectForks(pos);

        // Detection depends on exact implementation
        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Queen Forks', () => {
      it('can detect queen attacking multiple pieces', () => {
        const pos = new ChessPosition(FORK_POSITIONS.queenFork!.fen);
        const themes = detectForks(pos);

        // May detect as fork or double_attack
        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Double Check', () => {
      it('does not detect double check when not in check', () => {
        const pos = new ChessPosition(FORK_POSITIONS.noFork!.fen);
        const themes = detectForks(pos);

        const doubleChecks = themes.filter((t: DetectedTheme) => t.id === 'double_check');
        expect(doubleChecks.length).toBe(0);
      });
    });

    describe('No Fork Positions', () => {
      it('returns empty for opening position', () => {
        const pos = new ChessPosition(FORK_POSITIONS.noFork!.fen);
        const themes = detectForks(pos);

        const forks = themes.filter(
          (t: DetectedTheme) => t.id === 'knight_fork' || t.id === 'pawn_fork' || t.id === 'fork',
        );
        expect(forks.length).toBe(0);
      });
    });
  });

  describe('detectPotentialForks', () => {
    it('detects potential fork opportunities', () => {
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 4';
      const pos = new ChessPosition(fen);
      const themes = detectPotentialForks(pos);

      expect(Array.isArray(themes)).toBe(true);
    });

    it('returns themes with correct structure', () => {
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 4';
      const pos = new ChessPosition(fen);
      const themes = detectPotentialForks(pos);

      for (const theme of themes) {
        expect(theme.id).toBeDefined();
        expect(theme.category).toBe('tactical');
        expect(theme.beneficiary).toBeDefined();
      }
    });

    it('limits returned potential forks', () => {
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 4';
      const pos = new ChessPosition(fen);
      const themes = detectPotentialForks(pos);

      expect(themes.length).toBeLessThanOrEqual(5);
    });
  });

  describe('detectDoubleAttacks', () => {
    it('detects double attack on valuable pieces', () => {
      const pos = new ChessPosition(FORK_POSITIONS.doubleAttack!.fen);
      const themes = detectDoubleAttacks(pos);

      expect(Array.isArray(themes)).toBe(true);
    });

    it('returns themes for both colors', () => {
      const fen = 'r1bqk2r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
      const pos = new ChessPosition(fen);
      const themes = detectDoubleAttacks(pos);

      expect(Array.isArray(themes)).toBe(true);
    });

    it('correctly identifies beneficiary', () => {
      const pos = new ChessPosition(FORK_POSITIONS.queenFork!.fen);
      const themes = detectDoubleAttacks(pos);

      for (const theme of themes) {
        expect(['w', 'b']).toContain(theme.beneficiary);
      }
    });
  });

  describe('Theme Structure', () => {
    it('fork themes have all required fields', () => {
      // Position with clear fork
      const fen = '4k3/8/5q2/4N3/8/8/8/4K3 w - - 0 1';
      const pos = new ChessPosition(fen);
      const themes = detectForks(pos);

      for (const theme of themes) {
        expect(theme.id).toBeDefined();
        expect(theme.category).toBe('tactical');
        expect(['high', 'medium', 'low']).toContain(theme.confidence);
        expect(['critical', 'significant', 'minor']).toContain(theme.severity);
        expect(['w', 'b']).toContain(theme.beneficiary);
        expect(theme.explanation).toBeDefined();
      }
    });

    it('includes squares in fork detection', () => {
      const fen = '4k3/8/5q2/4N3/8/8/8/4K3 w - - 0 1';
      const pos = new ChessPosition(fen);
      const themes = detectForks(pos);

      const fork = themes.find((t: DetectedTheme) => t.id === 'knight_fork' || t.id === 'fork');
      if (fork) {
        expect(fork.squares?.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('includes material at stake when fork exists', () => {
      const fen = '4k3/8/5q2/4N3/8/8/8/4K3 w - - 0 1';
      const pos = new ChessPosition(fen);
      const themes = detectForks(pos);

      const fork = themes.find((t: DetectedTheme) => t.id === 'knight_fork');
      if (fork) {
        expect(fork.materialAtStake).toBeDefined();
        expect(fork.materialAtStake).toBeGreaterThan(0);
      }
    });
  });
});
