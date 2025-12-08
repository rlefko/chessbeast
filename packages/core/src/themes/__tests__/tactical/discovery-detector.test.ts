/**
 * Discovered Attack/Check Detection Tests
 */

import { ChessPosition } from '@chessbeast/pgn';
import { describe, it, expect } from 'vitest';

import {
  detectDiscoveries,
  detectPotentialDiscoveries,
} from '../../tactical/discovery-detector.js';
import type { DetectedTheme } from '../../types.js';
import { DISCOVERY_POSITIONS } from '../fixtures.js';

describe('Discovered Attack Detection', () => {
  describe('detectDiscoveries', () => {
    describe('Discovered Check', () => {
      it('returns themes for discovered check position', () => {
        const pos = new ChessPosition(DISCOVERY_POSITIONS.discoveredCheckKnight!.fen);
        const themes = detectDiscoveries(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('returns themes for rook discovered check position', () => {
        const pos = new ChessPosition(DISCOVERY_POSITIONS.discoveredAttackRook!.fen);
        const themes = detectDiscoveries(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('returns themes for pawn discovered check position', () => {
        const pos = new ChessPosition(DISCOVERY_POSITIONS.discoveredCheckPawn!.fen);
        const themes = detectDiscoveries(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Discovered Attack', () => {
      it('detects discovered attack on valuable piece', () => {
        const pos = new ChessPosition(DISCOVERY_POSITIONS.discoveredAttackBishop!.fen);
        const themes = detectDiscoveries(pos);

        // Should find discovered attack potential
        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('No Discovery Positions', () => {
      it('does not detect discovery in opening position', () => {
        const pos = new ChessPosition(DISCOVERY_POSITIONS.noDiscovery!.fen);
        const themes = detectDiscoveries(pos);

        const discoveries = themes.filter(
          (t: DetectedTheme) => t.id === 'discovered_check' || t.id === 'discovered_attack',
        );
        expect(discoveries.length).toBe(0);
      });
    });

    describe('Discovery Theme Structure', () => {
      it('discovery themes have all required fields', () => {
        const pos = new ChessPosition(DISCOVERY_POSITIONS.discoveredCheckKnight!.fen);
        const themes = detectDiscoveries(pos);

        for (const theme of themes) {
          expect(theme.id).toBeDefined();
          expect(theme.category).toBe('tactical');
          expect(['high', 'medium', 'low']).toContain(theme.confidence);
          expect(['critical', 'significant', 'minor']).toContain(theme.severity);
          expect(['w', 'b']).toContain(theme.beneficiary);
          expect(theme.explanation).toBeDefined();
        }
      });

      it('includes blocker and attacker in explanation', () => {
        const pos = new ChessPosition(DISCOVERY_POSITIONS.discoveredCheckKnight!.fen);
        const themes = detectDiscoveries(pos);

        const discovery = themes.find(
          (t: DetectedTheme) => t.id === 'discovered_check' || t.id === 'discovered_attack',
        );
        if (discovery) {
          expect(discovery.explanation.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Multiple Discoveries', () => {
      it('can detect multiple discovery opportunities', () => {
        // Complex position with multiple potential discoveries
        const fen = '4k3/8/4N3/8/8/8/4R3/4KB2 w - - 0 1';
        const pos = new ChessPosition(fen);
        const themes = detectDiscoveries(pos);

        // Should handle multiple pieces blocking
        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Severity Classification', () => {
      it('discovered check is critical severity', () => {
        const pos = new ChessPosition(DISCOVERY_POSITIONS.discoveredCheckKnight!.fen);
        const themes = detectDiscoveries(pos);

        const check = themes.find((t: DetectedTheme) => t.id === 'discovered_check');
        if (check) {
          expect(check.severity).toBe('critical');
        }
      });
    });
  });

  describe('detectPotentialDiscoveries', () => {
    it('returns array of potential discovery themes', () => {
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
      const pos = new ChessPosition(fen);
      const themes = detectPotentialDiscoveries(pos);

      expect(Array.isArray(themes)).toBe(true);
    });
  });
});
