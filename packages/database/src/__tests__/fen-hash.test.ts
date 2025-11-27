import { describe, it, expect } from 'vitest';

import { normalizeFen, hashFen, unhashFen } from '../utils/fen-hash.js';

describe('FEN Hash Utilities', () => {
  describe('normalizeFen', () => {
    it('should remove halfmove and fullmove counters', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const normalized = normalizeFen(fen);
      expect(normalized).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
    });

    it('should preserve position, turn, castling, and en passant', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
      const normalized = normalizeFen(fen);
      expect(normalized).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3');
    });

    it('should handle position without castling rights', () => {
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
      const normalized = normalizeFen(fen);
      expect(normalized).toBe('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -');
    });

    it('should handle position with no castling', () => {
      const fen = '8/8/8/8/8/8/8/4K3 w - - 0 1';
      const normalized = normalizeFen(fen);
      expect(normalized).toBe('8/8/8/8/8/8/8/4K3 w - -');
    });
  });

  describe('hashFen', () => {
    it('should create a base64url encoded hash', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const hash = hashFen(fen);
      // Base64url should not contain + or /
      expect(hash).not.toContain('+');
      expect(hash).not.toContain('/');
    });

    it('should produce the same hash for same normalized position', () => {
      const fen1 = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const fen2 = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 5 10';
      expect(hashFen(fen1)).toBe(hashFen(fen2));
    });

    it('should produce different hashes for different positions', () => {
      const fen1 = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const fen2 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
      expect(hashFen(fen1)).not.toBe(hashFen(fen2));
    });
  });

  describe('unhashFen', () => {
    it('should reverse hashFen correctly', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const normalized = normalizeFen(fen);
      const hash = hashFen(fen);
      const unhashed = unhashFen(hash);
      expect(unhashed).toBe(normalized);
    });

    it('should work for complex positions', () => {
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
      const normalized = normalizeFen(fen);
      const hash = hashFen(fen);
      const unhashed = unhashFen(hash);
      expect(unhashed).toBe(normalized);
    });
  });
});
