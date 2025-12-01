/**
 * Tests for material balance calculation
 */

import { describe, it, expect } from 'vitest';

import {
  getMaterialBalance,
  getSideMaterial,
  getMaterialDelta,
  PIECE_VALUES,
} from '../material.js';

describe('PIECE_VALUES', () => {
  it('should have standard piece values', () => {
    expect(PIECE_VALUES.p).toBe(100);
    expect(PIECE_VALUES.n).toBe(320);
    expect(PIECE_VALUES.b).toBe(330);
    expect(PIECE_VALUES.r).toBe(500);
    expect(PIECE_VALUES.q).toBe(900);
    expect(PIECE_VALUES.k).toBe(0);
  });
});

describe('getMaterialBalance', () => {
  it('should return 0 for starting position', () => {
    const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(getMaterialBalance(startingFen)).toBe(0);
  });

  it('should return positive when white has extra material', () => {
    // White has extra queen
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNRQ w KQkq - 0 1';
    expect(getMaterialBalance(fen)).toBeGreaterThan(0);
  });

  it('should return negative when black has extra material', () => {
    // Black has extra queen
    const fen = 'rnbqkbnrq/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(getMaterialBalance(fen)).toBeLessThan(0);
  });

  it('should calculate correctly with missing pieces', () => {
    // White missing queen (900cp), Black has everything
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1';
    expect(getMaterialBalance(fen)).toBe(-900); // Queen value
  });

  it('should handle empty board with just kings', () => {
    const fen = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
    expect(getMaterialBalance(fen)).toBe(0);
  });
});

describe('getSideMaterial', () => {
  it('should calculate white material correctly', () => {
    const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    // 8 pawns + 2 knights + 2 bishops + 2 rooks + 1 queen + 1 king
    const expectedWhite = 8 * 100 + 2 * 320 + 2 * 330 + 2 * 500 + 900 + 0;
    expect(getSideMaterial(startingFen, true)).toBe(expectedWhite);
  });

  it('should calculate black material correctly', () => {
    const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    // Same as white in starting position
    const expectedBlack = 8 * 100 + 2 * 320 + 2 * 330 + 2 * 500 + 900 + 0;
    expect(getSideMaterial(startingFen, false)).toBe(expectedBlack);
  });

  it('should return 0 for empty position with king only', () => {
    const fen = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
    expect(getSideMaterial(fen, true)).toBe(0);
    expect(getSideMaterial(fen, false)).toBe(0);
  });
});

describe('getMaterialDelta', () => {
  it('should return 0 when no material change', () => {
    const fenBefore = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const fenAfter = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    expect(getMaterialDelta(fenBefore, fenAfter, true)).toBe(0);
  });

  it('should return negative when white loses material (from white perspective)', () => {
    // White captures nothing but loses a pawn
    const fenBefore = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const fenAfter = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPP1/RNBQKBNR b KQkq - 0 1';
    expect(getMaterialDelta(fenBefore, fenAfter, true)).toBe(-100);
  });

  it('should return positive when white gains material (captures)', () => {
    // White captures black pawn (black loses material)
    const fenBefore = 'rnbqkbnr/pppppppp/8/8/8/3P4/PPP1PPPP/RNBQKBNR b KQkq - 0 1';
    const fenAfter = 'rnbqkbnr/ppp1pppp/8/8/8/3P4/PPP1PPPP/RNBQKBNR w KQkq - 0 1';
    // Black lost a pawn = +100 for white
    expect(getMaterialDelta(fenBefore, fenAfter, true)).toBe(100);
  });

  it('should be negated for black moves', () => {
    // Same material change but from black perspective
    const fenBefore = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const fenAfter = 'rnbqkbnr/ppppppp1/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    // Black lost a pawn = -100 from black perspective
    expect(getMaterialDelta(fenBefore, fenAfter, false)).toBe(-100);
  });
});
