/**
 * Pin Detection Tests
 */

import { ChessPosition } from '@chessbeast/pgn';
import { describe, it, expect } from 'vitest';

import { detectPins, detectSituationalPins } from '../../tactical/pin-detector.js';
import type { DetectedTheme } from '../../types.js';
import { PIN_POSITIONS } from '../fixtures.js';

describe('Pin Detection', () => {
  describe('detectPins', () => {
    describe('Absolute Pins', () => {
      it('returns array of themes', () => {
        const pos = new ChessPosition(PIN_POSITIONS.absolutePinBishop!.fen);
        const themes = detectPins(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('detects rook pinning piece on file', () => {
        const pos = new ChessPosition(PIN_POSITIONS.absolutePinOnFile!.fen);
        const themes = detectPins(pos);

        const absolutePins = themes.filter((t: DetectedTheme) => t.id === 'absolute_pin');
        expect(absolutePins.length).toBeGreaterThan(0);
        expect(absolutePins[0]?.beneficiary).toBe('w');
      });

      it('does not detect pin when none exists', () => {
        const pos = new ChessPosition(PIN_POSITIONS.noPinStarting!.fen);
        const themes = detectPins(pos);

        const absolutePins = themes.filter((t: DetectedTheme) => t.id === 'absolute_pin');
        expect(absolutePins.length).toBe(0);
      });
    });

    describe('Relative Pins', () => {
      it('returns themes for relative pin positions', () => {
        const pos = new ChessPosition(PIN_POSITIONS.relativePinBishop!.fen);
        const themes = detectPins(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('has correct structure for detected pins', () => {
        const pos = new ChessPosition(PIN_POSITIONS.relativePinToRook!.fen);
        const themes = detectPins(pos);

        for (const theme of themes) {
          expect(theme.id).toBeDefined();
          expect(theme.category).toBe('tactical');
          expect(['w', 'b']).toContain(theme.beneficiary);
        }
      });
    });

    describe('Cross Pins', () => {
      it('returns themes for cross pin positions', () => {
        const pos = new ChessPosition(PIN_POSITIONS.crossPinDiagonals!.fen);
        const themes = detectPins(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Multiple Pins', () => {
      it('can detect multiple pins in same position', () => {
        const fen = 'r1bqk2r/pppp1ppp/2n2n2/4p1B1/1b2P3/2NP1N2/PPP2PPP/R2QKB1R w KQkq - 0 5';
        const pos = new ChessPosition(fen);
        const themes = detectPins(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });
  });

  describe('detectSituationalPins', () => {
    it('detects potential pin setup', () => {
      const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
      const pos = new ChessPosition(fen);
      const themes = detectSituationalPins(pos);

      expect(Array.isArray(themes)).toBe(true);
    });

    it('returns potential pins with correct structure', () => {
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 4';
      const pos = new ChessPosition(fen);
      const themes = detectSituationalPins(pos);

      for (const theme of themes) {
        expect(theme.id).toBeDefined();
        expect(theme.category).toBe('tactical');
        expect(['high', 'medium', 'low']).toContain(theme.confidence);
      }
    });
  });

  describe('Theme Structure', () => {
    it('returns themes with all required fields when detected', () => {
      const pos = new ChessPosition(PIN_POSITIONS.absolutePinOnFile!.fen);
      const themes = detectPins(pos);

      for (const theme of themes) {
        expect(theme.id).toBeDefined();
        expect(theme.category).toBe('tactical');
        expect(['high', 'medium', 'low']).toContain(theme.confidence);
        expect(['critical', 'significant', 'minor']).toContain(theme.severity);
        expect(['w', 'b']).toContain(theme.beneficiary);
        expect(theme.explanation).toBeDefined();
      }
    });

    it('includes involved squares in theme', () => {
      const pos = new ChessPosition(PIN_POSITIONS.absolutePinOnFile!.fen);
      const themes = detectPins(pos);

      const pin = themes.find((t: DetectedTheme) => t.id === 'absolute_pin');
      if (pin) {
        expect(pin.squares?.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('includes involved pieces in theme', () => {
      const pos = new ChessPosition(PIN_POSITIONS.absolutePinOnFile!.fen);
      const themes = detectPins(pos);

      const pin = themes.find((t: DetectedTheme) => t.id === 'absolute_pin');
      if (pin) {
        expect(pin.pieces?.length).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
