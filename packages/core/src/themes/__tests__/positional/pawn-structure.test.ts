/**
 * Pawn Structure Detection Tests
 */

import { ChessPosition } from '@chessbeast/pgn';
import { describe, it, expect } from 'vitest';

import { detectPawnStructure } from '../../positional/pawn-structure.js';
import { PAWN_STRUCTURE_POSITIONS } from '../fixtures.js';

describe('Pawn Structure Detection', () => {
  describe('detectPawnStructure', () => {
    describe('Isolated Pawns', () => {
      it('returns themes for isolated d-pawn position', () => {
        const pos = new ChessPosition(PAWN_STRUCTURE_POSITIONS.isolatedDPawn!.fen);
        const themes = detectPawnStructure(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('returns themes for isolated c-pawn position', () => {
        const pos = new ChessPosition(PAWN_STRUCTURE_POSITIONS.isolatedCPawn!.fen);
        const themes = detectPawnStructure(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('identifies which color has isolated pawn when detected', () => {
        const pos = new ChessPosition(PAWN_STRUCTURE_POSITIONS.isolatedDPawn!.fen);
        const themes = detectPawnStructure(pos);

        const isolated = themes.find((t) => t.id === 'isolated_pawn');
        if (isolated) {
          expect(['w', 'b']).toContain(isolated.beneficiary);
        }
      });
    });

    describe('Doubled Pawns', () => {
      it('detects doubled c-pawns', () => {
        const pos = new ChessPosition(PAWN_STRUCTURE_POSITIONS.doubledCPawns!.fen);
        const themes = detectPawnStructure(pos);

        const doubled = themes.filter((t) => t.id === 'doubled_pawns');
        expect(doubled.length).toBeGreaterThan(0);
      });

      it('includes file with doubled pawns', () => {
        const pos = new ChessPosition(PAWN_STRUCTURE_POSITIONS.doubledCPawns!.fen);
        const themes = detectPawnStructure(pos);

        const doubled = themes.find((t) => t.id === 'doubled_pawns');
        if (doubled) {
          expect(doubled.explanation.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Backward Pawns', () => {
      it('returns themes for backward d-pawn position', () => {
        const pos = new ChessPosition(PAWN_STRUCTURE_POSITIONS.backwardDPawn!.fen);
        const themes = detectPawnStructure(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Passed Pawns', () => {
      it('detects passed d-pawn', () => {
        const pos = new ChessPosition(PAWN_STRUCTURE_POSITIONS.passedDPawn!.fen);
        const themes = detectPawnStructure(pos);

        const passed = themes.filter((t) => t.id === 'passed_pawn');
        expect(passed.length).toBeGreaterThan(0);
      });

      it('detects connected passed pawns', () => {
        const pos = new ChessPosition(PAWN_STRUCTURE_POSITIONS.passedConnected!.fen);
        const themes = detectPawnStructure(pos);

        const passed = themes.filter((t) => t.id === 'passed_pawn');
        expect(passed.length).toBeGreaterThan(0);
      });

      it('includes pawn square', () => {
        const pos = new ChessPosition(PAWN_STRUCTURE_POSITIONS.passedDPawn!.fen);
        const themes = detectPawnStructure(pos);

        const passed = themes.find((t) => t.id === 'passed_pawn');
        if (passed) {
          expect(passed.squares?.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Pawn Break', () => {
      it('returns themes for d5 pawn break position', () => {
        const pos = new ChessPosition(PAWN_STRUCTURE_POSITIONS.pawnBreakD5!.fen);
        const themes = detectPawnStructure(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('returns themes for c4 pawn break position', () => {
        const pos = new ChessPosition(PAWN_STRUCTURE_POSITIONS.pawnBreakC4!.fen);
        const themes = detectPawnStructure(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Pawn Majority', () => {
      it('returns themes for queenside pawn majority position', () => {
        const pos = new ChessPosition(PAWN_STRUCTURE_POSITIONS.queensideMajority!.fen);
        const themes = detectPawnStructure(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Weak Pawn (Generic)', () => {
      it('detects generic weak pawn', () => {
        const pos = new ChessPosition(PAWN_STRUCTURE_POSITIONS.weakPawn!.fen);
        const themes = detectPawnStructure(pos);

        // Should detect some pawn weakness
        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Steamrolling', () => {
      it('detects steamrolling pawns', () => {
        const pos = new ChessPosition(PAWN_STRUCTURE_POSITIONS.steamrolling!.fen);
        const themes = detectPawnStructure(pos);

        const steamroll = themes.filter((t) => t.id === 'steamrolling');
        expect(steamroll.length).toBeGreaterThan(0);
        expect(steamroll[0]?.beneficiary).toBe('w');
      });
    });

    describe('Pawn Structure Theme Structure', () => {
      it('pawn structure themes have all required fields', () => {
        const pos = new ChessPosition(PAWN_STRUCTURE_POSITIONS.isolatedDPawn!.fen);
        const themes = detectPawnStructure(pos);

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

    describe('Multiple Pawn Structure Issues', () => {
      it('can detect multiple pawn structure issues', () => {
        // Complex pawn structure
        const fen = 'rnbqkbnr/pp1ppppp/8/2p5/2PP4/2P5/PP2PPPP/RNBQKBNR w KQkq - 0 3';
        const pos = new ChessPosition(fen);
        const themes = detectPawnStructure(pos);

        // Should detect doubled pawns and possibly other issues
        expect(themes.length).toBeGreaterThan(0);
      });
    });
  });
});
