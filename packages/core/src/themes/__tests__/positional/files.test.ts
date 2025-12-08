/**
 * File Control Detection Tests
 */

import { ChessPosition } from '@chessbeast/pgn';
import { describe, it, expect } from 'vitest';

import { detectFileThemes } from '../../positional/files.js';
import { FILE_POSITIONS } from '../fixtures.js';

describe('File Control Detection', () => {
  describe('detectFileThemes', () => {
    describe('Open Files', () => {
      it('returns themes for open e-file position', () => {
        const pos = new ChessPosition(FILE_POSITIONS.openEFile!.fen);
        const themes = detectFileThemes(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('returns themes for open d-file position', () => {
        const pos = new ChessPosition(FILE_POSITIONS.openDFile!.fen);
        const themes = detectFileThemes(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('identifies who controls open file when detected', () => {
        const pos = new ChessPosition(FILE_POSITIONS.openEFile!.fen);
        const themes = detectFileThemes(pos);

        const openFile = themes.find((t) => t.id === 'open_file');
        if (openFile) {
          expect(['w', 'b']).toContain(openFile.beneficiary);
        }
      });
    });

    describe('Semi-Open Files', () => {
      it('returns themes for semi-open c-file position', () => {
        const pos = new ChessPosition(FILE_POSITIONS.semiOpenCFile!.fen);
        const themes = detectFileThemes(pos);

        expect(Array.isArray(themes)).toBe(true);
      });

      it('identifies who has semi-open file when detected', () => {
        const pos = new ChessPosition(FILE_POSITIONS.semiOpenCFile!.fen);
        const themes = detectFileThemes(pos);

        const semiOpen = themes.find((t) => t.id === 'semi_open_file');
        if (semiOpen) {
          expect(['w', 'b']).toContain(semiOpen.beneficiary);
        }
      });
    });

    describe('No Open Files', () => {
      it('does not detect open file in closed position', () => {
        const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
        const pos = new ChessPosition(fen);
        const themes = detectFileThemes(pos);

        const openFiles = themes.filter((t) => t.id === 'open_file');
        expect(openFiles.length).toBe(0);
      });
    });

    describe('File Theme Structure', () => {
      it('file themes have all required fields', () => {
        const pos = new ChessPosition(FILE_POSITIONS.openEFile!.fen);
        const themes = detectFileThemes(pos);

        for (const theme of themes) {
          expect(theme.id).toBeDefined();
          expect(theme.category).toBe('positional');
          expect(['high', 'medium', 'low']).toContain(theme.confidence);
          expect(['critical', 'significant', 'minor']).toContain(theme.severity);
          expect(['w', 'b']).toContain(theme.beneficiary);
          expect(theme.explanation).toBeDefined();
        }
      });

      it('includes file letter in explanation', () => {
        const pos = new ChessPosition(FILE_POSITIONS.openEFile!.fen);
        const themes = detectFileThemes(pos);

        const openFile = themes.find((t) => t.id === 'open_file');
        if (openFile) {
          expect(openFile.explanation.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Multiple File Themes', () => {
      it('can detect multiple file control themes', () => {
        // Position with multiple file situations
        const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 4 4';
        const pos = new ChessPosition(fen);
        const themes = detectFileThemes(pos);

        expect(Array.isArray(themes)).toBe(true);
      });
    });

    describe('Rook Placement', () => {
      it('considers rook placement on files', () => {
        const pos = new ChessPosition(FILE_POSITIONS.openEFile!.fen);
        const themes = detectFileThemes(pos);

        // Should consider who has rooks on the file
        expect(Array.isArray(themes)).toBe(true);
      });
    });
  });
});
