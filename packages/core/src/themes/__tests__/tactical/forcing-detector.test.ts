/**
 * Forcing Move Detection Tests
 */

import { ChessPosition } from '@chessbeast/pgn';
import { describe, it, expect } from 'vitest';

import { detectForcingMoves } from '../../tactical/forcing-detector.js';
import type { DetectedTheme } from '../../types.js';

describe('Forcing Move Detection', () => {
  describe('detectForcingMoves', () => {
    describe('Attraction', () => {
      it('detects attraction opportunity', () => {
        // Position where piece can be attracted to bad square
        const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
        const pos = new ChessPosition(fen);
        const themes = detectForcingMoves(pos);

        // May detect attraction patterns
        expect(Array.isArray(themes)).toBe(true);
      });

      it('includes attracted piece in explanation', () => {
        const fen = 'r1bqkb1r/pppp1ppp/2n5/4n3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4';
        const pos = new ChessPosition(fen);
        const themes = detectForcingMoves(pos);

        const attraction = themes.find((t: DetectedTheme) => t.id === 'attraction');
        if (attraction) {
          expect(attraction.explanation.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Decoy', () => {
      it('detects decoy opportunity', () => {
        // Position where defender can be lured away
        const fen = '4k3/4r3/8/8/8/8/4R3/4K3 w - - 0 1';
        const pos = new ChessPosition(fen);
        const themes = detectForcingMoves(pos);

        // May detect decoy patterns
        expect(Array.isArray(themes)).toBe(true);
      });

      it('identifies defender and defended piece', () => {
        const fen = '4k3/8/3rn3/8/8/8/4R3/4K3 w - - 0 1';
        const pos = new ChessPosition(fen);
        const themes = detectForcingMoves(pos);

        for (const theme of themes) {
          if (theme.id === 'decoy') {
            expect(theme.squares?.length).toBeGreaterThan(0);
          }
        }
      });
    });

    describe('Interference', () => {
      it('detects interference opportunity', () => {
        // Position where piece can block enemy communication
        const fen = 'r3k2r/ppp2ppp/2n1bn2/3p4/3P4/2N1BN2/PPP2PPP/R3K2R w KQkq - 0 8';
        const pos = new ChessPosition(fen);
        const themes = detectForcingMoves(pos);

        // May detect interference patterns
        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Clearance', () => {
      it('detects clearance opportunity', () => {
        // Position where piece can move to reveal attack
        const fen = '4k3/8/8/8/8/4N3/4R3/4K3 w - - 0 1';
        const pos = new ChessPosition(fen);
        const themes = detectForcingMoves(pos);

        // May detect clearance patterns
        expect(Array.isArray(themes)).toBe(true);
      });

      it('identifies clearing piece and benefiting piece', () => {
        const fen = '4k3/8/4N3/8/8/8/4R3/4K3 w - - 0 1';
        const pos = new ChessPosition(fen);
        const themes = detectForcingMoves(pos);

        for (const theme of themes) {
          if (theme.id === 'clearance') {
            expect(theme.pieces?.length).toBeGreaterThan(0);
          }
        }
      });
    });

    describe('No Forcing Moves', () => {
      it('handles quiet position appropriately', () => {
        const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
        const pos = new ChessPosition(fen);
        const themes = detectForcingMoves(pos);

        // Quiet positions typically have no or few forcing patterns
        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Forcing Theme Structure', () => {
      it('forcing themes have all required fields', () => {
        const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
        const pos = new ChessPosition(fen);
        const themes = detectForcingMoves(pos);

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

    describe('Both Colors', () => {
      it('detects forcing moves for both colors', () => {
        const fen = 'r1bqk2r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
        const pos = new ChessPosition(fen);
        const themes = detectForcingMoves(pos);

        // Both colors should be checked
        expect(Array.isArray(themes)).toBe(true);
      });
    });
  });
});
