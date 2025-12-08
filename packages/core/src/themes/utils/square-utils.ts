/**
 * Square Utilities
 *
 * Helper functions for working with chess squares and coordinates.
 */

import type { Direction } from '../types.js';

/**
 * File letters a-h mapped to indices 0-7
 */
const FILE_TO_INDEX: Record<string, number> = {
  a: 0,
  b: 1,
  c: 2,
  d: 3,
  e: 4,
  f: 5,
  g: 6,
  h: 7,
};

/**
 * Index 0-7 mapped to file letters
 */
const INDEX_TO_FILE = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/**
 * Get file index (0-7) from square
 */
export function fileIndex(square: string): number {
  return FILE_TO_INDEX[square[0]!] ?? -1;
}

/**
 * Get rank index (0-7) from square
 */
export function rankIndex(square: string): number {
  return parseInt(square[1]!, 10) - 1;
}

/**
 * Get file letter from square
 */
export function file(square: string): string {
  return square[0]!;
}

/**
 * Get rank number (1-8) from square
 */
export function rank(square: string): number {
  return parseInt(square[1]!, 10);
}

/**
 * Create square from file and rank indices (0-7)
 */
export function squareFromIndices(fileIdx: number, rankIdx: number): string | null {
  if (fileIdx < 0 || fileIdx > 7 || rankIdx < 0 || rankIdx > 7) {
    return null;
  }
  return `${INDEX_TO_FILE[fileIdx]}${rankIdx + 1}`;
}

/**
 * Get adjacent file indices to a given file index
 * Accepts either a file letter (string) or file index (number)
 */
export function getAdjacentFiles(f: string | number): number[] {
  const idx = typeof f === 'number' ? f : FILE_TO_INDEX[f];
  if (idx === undefined || idx < 0 || idx > 7) return [];

  const result: number[] = [];
  if (idx > 0) result.push(idx - 1);
  if (idx < 7) result.push(idx + 1);
  return result;
}

/**
 * Check if two squares are on the same file
 */
export function areOnSameFile(sq1: string, sq2: string): boolean {
  return sq1[0] === sq2[0];
}

/**
 * Check if two squares are on the same rank
 */
export function areOnSameRank(sq1: string, sq2: string): boolean {
  return sq1[1] === sq2[1];
}

/**
 * Check if two squares are on the same diagonal
 */
export function areOnSameDiagonal(sq1: string, sq2: string): boolean {
  const fileDiff = Math.abs(fileIndex(sq1) - fileIndex(sq2));
  const rankDiff = Math.abs(rankIndex(sq1) - rankIndex(sq2));
  return fileDiff === rankDiff && fileDiff > 0;
}

/**
 * Check if a square is a light square
 */
export function isLightSquare(square: string): boolean {
  const f = fileIndex(square);
  const r = rankIndex(square);
  return (f + r) % 2 === 1;
}

/**
 * Get Manhattan distance between two squares
 */
export function getManhattanDistance(sq1: string, sq2: string): number {
  const fileDiff = Math.abs(fileIndex(sq1) - fileIndex(sq2));
  const rankDiff = Math.abs(rankIndex(sq1) - rankIndex(sq2));
  return fileDiff + rankDiff;
}

/**
 * Get Chebyshev (king) distance between two squares
 */
export function getKingDistance(sq1: string, sq2: string): number {
  const fileDiff = Math.abs(fileIndex(sq1) - fileIndex(sq2));
  const rankDiff = Math.abs(rankIndex(sq1) - rankIndex(sq2));
  return Math.max(fileDiff, rankDiff);
}

/**
 * Get direction from one square to another (if on same line)
 * Returns null if squares are not on a straight line
 */
export function getDirection(from: string, to: string): Direction | null {
  const fromFile = fileIndex(from);
  const fromRank = rankIndex(from);
  const toFile = fileIndex(to);
  const toRank = rankIndex(to);

  const fileDiff = toFile - fromFile;
  const rankDiff = toRank - fromRank;

  if (fileDiff === 0 && rankDiff === 0) return null;

  // Same file (vertical)
  if (fileDiff === 0) {
    return rankDiff > 0 ? 'n' : 's';
  }

  // Same rank (horizontal)
  if (rankDiff === 0) {
    return fileDiff > 0 ? 'e' : 'w';
  }

  // Diagonal
  if (Math.abs(fileDiff) === Math.abs(rankDiff)) {
    if (fileDiff > 0 && rankDiff > 0) return 'ne';
    if (fileDiff > 0 && rankDiff < 0) return 'se';
    if (fileDiff < 0 && rankDiff > 0) return 'nw';
    return 'sw';
  }

  // Not on a straight line
  return null;
}

/**
 * Get the opposite direction
 */
export function oppositeDirection(dir: Direction): Direction {
  const opposites: Record<Direction, Direction> = {
    n: 's',
    s: 'n',
    e: 'w',
    w: 'e',
    ne: 'sw',
    sw: 'ne',
    nw: 'se',
    se: 'nw',
  };
  return opposites[dir];
}

/**
 * Get all squares surrounding a square (king's movement squares)
 */
export function getSurroundingSquares(square: string): string[] {
  const f = fileIndex(square);
  const r = rankIndex(square);
  const result: string[] = [];

  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const sq = squareFromIndices(f + df, r + dr);
      if (sq) result.push(sq);
    }
  }

  return result;
}

/**
 * Get king zone (squares near the king, typically 3x3 or 4x4 area)
 */
export function getKingZone(kingSquare: string): string[] {
  const f = fileIndex(kingSquare);
  const r = rankIndex(kingSquare);
  const result: string[] = [];

  // Extended king zone: 5x3 in front of king, 3x2 behind
  for (let df = -1; df <= 1; df++) {
    for (let dr = -2; dr <= 2; dr++) {
      const sq = squareFromIndices(f + df, r + dr);
      if (sq) result.push(sq);
    }
  }

  return result;
}

/**
 * Check if a square is in the center (d4, d5, e4, e5)
 */
export function isCenterSquare(square: string): boolean {
  return ['d4', 'd5', 'e4', 'e5'].includes(square);
}

/**
 * Check if a square is in the extended center
 */
export function isExtendedCenter(square: string): boolean {
  const f = fileIndex(square);
  const r = rankIndex(square);
  return f >= 2 && f <= 5 && r >= 2 && r <= 5;
}

/**
 * Get squares on a specific rank
 */
export function getSquaresOnRank(r: number): string[] {
  return INDEX_TO_FILE.map((f) => `${f}${r}`);
}

/**
 * Get squares on a specific file
 */
export function getSquaresOnFile(f: string): string[] {
  return [1, 2, 3, 4, 5, 6, 7, 8].map((r) => `${f}${r}`);
}

/**
 * Check if square is valid
 */
export function isValidSquare(square: string): boolean {
  if (square.length !== 2) return false;
  const f = square[0];
  const r = square[1];
  return (
    f !== undefined && r !== undefined && FILE_TO_INDEX[f] !== undefined && r >= '1' && r <= '8'
  );
}

/**
 * Parse destination square from SAN move notation
 * Examples: "e4" -> "e4", "Nf3" -> "f3", "Bxe5" -> "e5", "O-O" -> null
 */
export function extractDestSquare(san: string): string | null {
  // Castling
  if (san.startsWith('O-O')) return null;

  // Remove check/mate symbols and promotion
  const cleaned = san.replace(/[+#=QRBN]$/, '').replace(/[+#]/, '');

  // Last two characters should be the destination
  if (cleaned.length >= 2) {
    const dest = cleaned.slice(-2);
    if (isValidSquare(dest)) return dest;
  }

  return null;
}
