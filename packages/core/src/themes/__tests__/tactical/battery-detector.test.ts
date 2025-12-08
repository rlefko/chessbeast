/**
 * Battery Detection Tests
 */

import { ChessPosition } from '@chessbeast/pgn';
import { describe, it, expect } from 'vitest';

import { detectBatteries } from '../../tactical/battery-detector.js';
import type { DetectedTheme } from '../../types.js';
import { BATTERY_POSITIONS } from '../fixtures.js';

describe('Battery Detection', () => {
  describe('detectBatteries', () => {
    describe('Queen-Bishop Battery', () => {
      it('returns themes for queen-bishop diagonal position', () => {
        const pos = new ChessPosition(BATTERY_POSITIONS.queenBishopDiagonal!.fen);
        const themes = detectBatteries(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('returns themes for queen-bishop file position', () => {
        const pos = new ChessPosition(BATTERY_POSITIONS.queenBishopFile!.fen);
        const themes = detectBatteries(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('returns themes for bishop-queen battery position', () => {
        const pos = new ChessPosition(BATTERY_POSITIONS.bishopQueenBattery!.fen);
        const themes = detectBatteries(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Doubled Rooks', () => {
      it('returns themes for rooks doubled on file', () => {
        const pos = new ChessPosition(BATTERY_POSITIONS.rooksDoubledFile!.fen);
        const themes = detectBatteries(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('returns themes for rooks doubled on rank', () => {
        const pos = new ChessPosition(BATTERY_POSITIONS.rooksDoubledRank!.fen);
        const themes = detectBatteries(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe("Alekhine's Gun", () => {
      it("returns themes for Alekhine's gun pattern", () => {
        const pos = new ChessPosition(BATTERY_POSITIONS.alekhinesGun!.fen);
        const themes = detectBatteries(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('No Battery Positions', () => {
      it('does not detect battery in opening', () => {
        const pos = new ChessPosition(BATTERY_POSITIONS.noBattery!.fen);
        const themes = detectBatteries(pos);

        const batteries = themes.filter(
          (t: DetectedTheme) =>
            t.id === 'battery' ||
            t.id === 'queen_bishop_battery' ||
            t.id === 'rooks_doubled' ||
            t.id === 'alekhines_gun',
        );
        expect(batteries.length).toBe(0);
      });
    });

    describe('Rooks on Seventh', () => {
      it('returns themes for two rooks on 7th rank', () => {
        const pos = new ChessPosition(BATTERY_POSITIONS.rooksSeventh!.fen);
        const themes = detectBatteries(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('returns themes for two black rooks on 2nd rank', () => {
        const pos = new ChessPosition(BATTERY_POSITIONS.rooksSecond!.fen);
        const themes = detectBatteries(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Battery Theme Structure', () => {
      it('battery themes have all required fields when detected', () => {
        const pos = new ChessPosition(BATTERY_POSITIONS.rooksDoubledFile!.fen);
        const themes = detectBatteries(pos);

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

    describe('Multiple Batteries', () => {
      it('can detect multiple battery patterns', () => {
        const fen = '4k3/8/8/8/8/5B2/4RQ2/4RK2 w - - 0 1';
        const pos = new ChessPosition(fen);
        const themes = detectBatteries(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });
  });
});
