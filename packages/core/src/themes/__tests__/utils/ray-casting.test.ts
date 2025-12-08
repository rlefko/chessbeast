/**
 * Ray Casting Utility Tests
 */

import { ChessPosition } from '@chessbeast/pgn';
import { describe, it, expect } from 'vitest';

import {
  getSquaresInDirection,
  getSquaresBetween,
  getDirectionsForPiece,
  isClearPath,
} from '../../utils/ray-casting.js';

describe('Ray Casting Utilities', () => {
  describe('getSquaresInDirection', () => {
    it('returns squares going north', () => {
      const squares = getSquaresInDirection('e4', 'n');
      expect(squares).toEqual(['e5', 'e6', 'e7', 'e8']);
    });

    it('returns squares going south', () => {
      const squares = getSquaresInDirection('e4', 's');
      expect(squares).toEqual(['e3', 'e2', 'e1']);
    });

    it('returns squares going east', () => {
      const squares = getSquaresInDirection('e4', 'e');
      expect(squares).toEqual(['f4', 'g4', 'h4']);
    });

    it('returns squares going west', () => {
      const squares = getSquaresInDirection('e4', 'w');
      expect(squares).toEqual(['d4', 'c4', 'b4', 'a4']);
    });

    it('returns squares going northeast', () => {
      const squares = getSquaresInDirection('e4', 'ne');
      expect(squares).toEqual(['f5', 'g6', 'h7']);
    });

    it('returns squares going northwest', () => {
      const squares = getSquaresInDirection('e4', 'nw');
      expect(squares).toEqual(['d5', 'c6', 'b7', 'a8']);
    });

    it('returns squares going southeast', () => {
      const squares = getSquaresInDirection('e4', 'se');
      expect(squares).toEqual(['f3', 'g2', 'h1']);
    });

    it('returns squares going southwest', () => {
      const squares = getSquaresInDirection('e4', 'sw');
      expect(squares).toEqual(['d3', 'c2', 'b1']);
    });

    it('returns empty array from corner going off board', () => {
      const squares = getSquaresInDirection('a1', 'sw');
      expect(squares).toEqual([]);
    });

    it('returns empty array from edge going off board', () => {
      const squares = getSquaresInDirection('h4', 'e');
      expect(squares).toEqual([]);
    });
  });

  describe('getSquaresBetween', () => {
    it('returns squares between two squares on same file', () => {
      const squares = getSquaresBetween('e1', 'e8');
      expect(squares).toEqual(['e2', 'e3', 'e4', 'e5', 'e6', 'e7']);
    });

    it('returns squares between two squares on same rank', () => {
      const squares = getSquaresBetween('a4', 'h4');
      expect(squares).toEqual(['b4', 'c4', 'd4', 'e4', 'f4', 'g4']);
    });

    it('returns squares between two squares on diagonal', () => {
      const squares = getSquaresBetween('a1', 'h8');
      expect(squares).toEqual(['b2', 'c3', 'd4', 'e5', 'f6', 'g7']);
    });

    it('returns empty array for adjacent squares', () => {
      const squares = getSquaresBetween('e4', 'e5');
      expect(squares).toEqual([]);
    });

    it('returns empty array for non-aligned squares', () => {
      const squares = getSquaresBetween('e4', 'f6');
      expect(squares).toEqual([]);
    });

    it('works in reverse direction', () => {
      const squares = getSquaresBetween('e8', 'e1');
      expect(squares).toEqual(['e7', 'e6', 'e5', 'e4', 'e3', 'e2']);
    });
  });

  describe('getDirectionsForPiece', () => {
    it('returns orthogonal directions for rook', () => {
      const dirs = getDirectionsForPiece('r');
      expect(dirs).toContain('n');
      expect(dirs).toContain('s');
      expect(dirs).toContain('e');
      expect(dirs).toContain('w');
      expect(dirs.length).toBe(4);
    });

    it('returns diagonal directions for bishop', () => {
      const dirs = getDirectionsForPiece('b');
      expect(dirs).toContain('ne');
      expect(dirs).toContain('nw');
      expect(dirs).toContain('se');
      expect(dirs).toContain('sw');
      expect(dirs.length).toBe(4);
    });

    it('returns all 8 directions for queen', () => {
      const dirs = getDirectionsForPiece('q');
      expect(dirs.length).toBe(8);
    });

    it('returns empty array for knight', () => {
      const dirs = getDirectionsForPiece('n');
      expect(dirs).toEqual([]);
    });

    it('returns empty array for pawn', () => {
      const dirs = getDirectionsForPiece('p');
      expect(dirs).toEqual([]);
    });

    it('returns empty array for king', () => {
      const dirs = getDirectionsForPiece('k');
      expect(dirs).toEqual([]);
    });
  });

  describe('isClearPath', () => {
    it('returns true for clear path', () => {
      const pos = new ChessPosition('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
      const result = isClearPath(pos, 'e1', 'e8');
      expect(result).toBe(true);
    });

    it('returns false for blocked path', () => {
      const pos = new ChessPosition('4k3/8/8/8/4P3/8/8/4K3 w - - 0 1');
      const result = isClearPath(pos, 'e1', 'e8');
      expect(result).toBe(false);
    });

    it('returns true for adjacent squares', () => {
      const pos = new ChessPosition('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
      const result = isClearPath(pos, 'e4', 'e5');
      expect(result).toBe(true);
    });

    it('returns true for diagonal clear path', () => {
      const pos = new ChessPosition('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
      const result = isClearPath(pos, 'a1', 'h8');
      expect(result).toBe(true);
    });
  });
});
