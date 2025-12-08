/**
 * Square Utility Tests
 */

import { describe, it, expect } from 'vitest';

import {
  fileIndex,
  rankIndex,
  isLightSquare,
  areOnSameDiagonal,
  areOnSameFile,
  areOnSameRank,
  getAdjacentFiles,
  getKingZone,
  getKingDistance,
  getManhattanDistance,
  getDirection,
} from '../../utils/square-utils.js';

describe('Square Utilities', () => {
  describe('fileIndex', () => {
    it('returns 0 for a-file', () => {
      expect(fileIndex('a1')).toBe(0);
      expect(fileIndex('a8')).toBe(0);
    });

    it('returns 7 for h-file', () => {
      expect(fileIndex('h1')).toBe(7);
      expect(fileIndex('h8')).toBe(7);
    });

    it('returns correct index for middle files', () => {
      expect(fileIndex('e4')).toBe(4);
      expect(fileIndex('d5')).toBe(3);
    });
  });

  describe('rankIndex', () => {
    it('returns 0 for 1st rank', () => {
      expect(rankIndex('a1')).toBe(0);
      expect(rankIndex('h1')).toBe(0);
    });

    it('returns 7 for 8th rank', () => {
      expect(rankIndex('a8')).toBe(7);
      expect(rankIndex('h8')).toBe(7);
    });

    it('returns correct index for middle ranks', () => {
      expect(rankIndex('e4')).toBe(3);
      expect(rankIndex('d5')).toBe(4);
    });
  });

  describe('isLightSquare', () => {
    it('returns true for h1 (light)', () => {
      expect(isLightSquare('h1')).toBe(true);
    });

    it('returns false for a1 (dark)', () => {
      expect(isLightSquare('a1')).toBe(false);
    });

    it('returns true for a2 (light)', () => {
      expect(isLightSquare('a2')).toBe(true);
    });

    it('returns false for h8 (dark)', () => {
      expect(isLightSquare('h8')).toBe(false);
    });
  });

  describe('getManhattanDistance', () => {
    it('returns 0 for same square', () => {
      expect(getManhattanDistance('e4', 'e4')).toBe(0);
    });

    it('returns correct distance for adjacent squares', () => {
      expect(getManhattanDistance('e4', 'e5')).toBe(1);
      expect(getManhattanDistance('e4', 'f4')).toBe(1);
      expect(getManhattanDistance('e4', 'f5')).toBe(2);
    });

    it('returns correct distance for far squares', () => {
      expect(getManhattanDistance('a1', 'h8')).toBe(14);
      expect(getManhattanDistance('a1', 'a8')).toBe(7);
    });
  });

  describe('areOnSameDiagonal', () => {
    it('returns true for squares on same diagonal', () => {
      expect(areOnSameDiagonal('a1', 'h8')).toBe(true);
      expect(areOnSameDiagonal('e4', 'h7')).toBe(true);
    });

    it('returns false for squares not on same diagonal', () => {
      expect(areOnSameDiagonal('a1', 'a8')).toBe(false);
      expect(areOnSameDiagonal('e4', 'e5')).toBe(false);
    });

    it('returns false for same square (requires actual diagonal)', () => {
      expect(areOnSameDiagonal('e4', 'e4')).toBe(false);
    });
  });

  describe('areOnSameFile', () => {
    it('returns true for squares on same file', () => {
      expect(areOnSameFile('e1', 'e8')).toBe(true);
    });

    it('returns false for squares on different files', () => {
      expect(areOnSameFile('e1', 'f1')).toBe(false);
    });
  });

  describe('areOnSameRank', () => {
    it('returns true for squares on same rank', () => {
      expect(areOnSameRank('a4', 'h4')).toBe(true);
    });

    it('returns false for squares on different ranks', () => {
      expect(areOnSameRank('a4', 'a5')).toBe(false);
    });
  });

  describe('getAdjacentFiles', () => {
    it('returns adjacent files for middle file', () => {
      const adjacent = getAdjacentFiles('e');
      // Returns file indexes, not letters
      expect(adjacent.length).toBe(2);
    });

    it('returns one adjacent file for a-file', () => {
      const adjacent = getAdjacentFiles('a');
      expect(adjacent.length).toBe(1);
    });

    it('returns one adjacent file for h-file', () => {
      const adjacent = getAdjacentFiles('h');
      expect(adjacent.length).toBe(1);
    });
  });

  describe('getKingZone', () => {
    it('returns extended zone for center king (3x5 area)', () => {
      const zone = getKingZone('e4');
      expect(zone.length).toBe(15);
      expect(zone).toContain('e4');
      expect(zone).toContain('d3');
      expect(zone).toContain('f5');
      expect(zone).toContain('e2'); // Extended area
      expect(zone).toContain('e6'); // Extended area
    });

    it('returns correct squares for corner king', () => {
      const zone = getKingZone('a1');
      expect(zone.length).toBe(6); // 2 files x 3 ranks
      expect(zone).toContain('a1');
      expect(zone).toContain('a2');
      expect(zone).toContain('a3');
      expect(zone).toContain('b1');
      expect(zone).toContain('b2');
      expect(zone).toContain('b3');
    });

    it('returns correct squares for edge king', () => {
      const zone = getKingZone('e1');
      expect(zone.length).toBe(9); // 3 files x 3 ranks (limited by board edge)
    });
  });

  describe('getKingDistance', () => {
    it('returns 0 for same square', () => {
      expect(getKingDistance('e4', 'e4')).toBe(0);
    });

    it('returns 1 for adjacent squares', () => {
      expect(getKingDistance('e4', 'e5')).toBe(1);
      expect(getKingDistance('e4', 'f5')).toBe(1);
    });

    it('returns correct distance for far squares', () => {
      expect(getKingDistance('a1', 'h8')).toBe(7);
    });
  });

  describe('getDirection', () => {
    it('returns n for north', () => {
      expect(getDirection('e4', 'e8')).toBe('n');
    });

    it('returns s for south', () => {
      expect(getDirection('e4', 'e1')).toBe('s');
    });

    it('returns e for east', () => {
      expect(getDirection('e4', 'h4')).toBe('e');
    });

    it('returns w for west', () => {
      expect(getDirection('e4', 'a4')).toBe('w');
    });

    it('returns ne for northeast', () => {
      expect(getDirection('e4', 'h7')).toBe('ne');
    });

    it('returns nw for northwest', () => {
      expect(getDirection('e4', 'b7')).toBe('nw');
    });

    it('returns se for southeast', () => {
      expect(getDirection('e4', 'h1')).toBe('se');
    });

    it('returns sw for southwest', () => {
      expect(getDirection('e4', 'b1')).toBe('sw');
    });

    it('returns null for non-aligned squares', () => {
      expect(getDirection('e4', 'f6')).toBeNull();
    });
  });
});
