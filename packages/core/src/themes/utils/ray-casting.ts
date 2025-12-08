/**
 * Ray Casting Utilities
 *
 * Functions for tracing rays along files, ranks, and diagonals.
 * Used for detecting pins, skewers, x-rays, and batteries.
 */

import type { ChessPosition } from '@chessbeast/pgn';

import type { Direction, LocatedPiece, Color } from '../types.js';

import {
  fileIndex,
  rankIndex,
  squareFromIndices,
  getDirection,
  oppositeDirection,
} from './square-utils.js';

/**
 * Direction vectors for each direction
 */
const DIRECTION_VECTORS: Record<Direction, [number, number]> = {
  n: [0, 1],
  s: [0, -1],
  e: [1, 0],
  w: [-1, 0],
  ne: [1, 1],
  nw: [-1, 1],
  se: [1, -1],
  sw: [-1, -1],
};

/**
 * Get all squares in a direction from a starting square
 */
export function getSquaresInDirection(from: string, dir: Direction): string[] {
  const squares: string[] = [];
  const [df, dr] = DIRECTION_VECTORS[dir];
  let f = fileIndex(from) + df;
  let r = rankIndex(from) + dr;

  while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
    const sq = squareFromIndices(f, r);
    if (sq) squares.push(sq);
    f += df;
    r += dr;
  }

  return squares;
}

/**
 * Get squares between two squares (exclusive of both endpoints)
 * Returns empty array if squares are not on a straight line
 */
export function getSquaresBetween(from: string, to: string): string[] {
  const dir = getDirection(from, to);
  if (!dir) return [];

  const squares: string[] = [];
  const [df, dr] = DIRECTION_VECTORS[dir];
  let f = fileIndex(from) + df;
  let r = rankIndex(from) + dr;

  const toFile = fileIndex(to);
  const toRank = rankIndex(to);

  while (f !== toFile || r !== toRank) {
    if (f < 0 || f > 7 || r < 0 || r > 7) break;
    const sq = squareFromIndices(f, r);
    if (sq) squares.push(sq);
    f += df;
    r += dr;
  }

  return squares;
}

/**
 * Get all pieces along a ray from a starting square
 */
export function getPiecesOnRay(pos: ChessPosition, from: string, dir: Direction): LocatedPiece[] {
  const pieces: LocatedPiece[] = [];
  const squares = getSquaresInDirection(from, dir);

  for (const sq of squares) {
    const piece = pos.getPiece(sq);
    if (piece) {
      pieces.push({
        type: piece.type,
        color: piece.color,
        square: sq,
      });
    }
  }

  return pieces;
}

/**
 * Get the first piece encountered along a ray
 */
export function getFirstPieceOnRay(
  pos: ChessPosition,
  from: string,
  dir: Direction,
): LocatedPiece | null {
  const squares = getSquaresInDirection(from, dir);

  for (const sq of squares) {
    const piece = pos.getPiece(sq);
    if (piece) {
      return {
        type: piece.type,
        color: piece.color,
        square: sq,
      };
    }
  }

  return null;
}

/**
 * Check if there's a clear line between two squares
 */
export function isClearPath(pos: ChessPosition, from: string, to: string): boolean {
  const between = getSquaresBetween(from, to);
  return between.every((sq) => !pos.getPiece(sq));
}

/**
 * Get directions a piece can move in based on its type
 */
export function getDirectionsForPiece(pieceType: string): Direction[] {
  switch (pieceType.toLowerCase()) {
    case 'r':
      return ['n', 's', 'e', 'w'];
    case 'b':
      return ['ne', 'nw', 'se', 'sw'];
    case 'q':
      return ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    default:
      return [];
  }
}

/**
 * Check if a piece type can move in a given direction
 */
export function canPieceMoveInDirection(pieceType: string, dir: Direction): boolean {
  return getDirectionsForPiece(pieceType).includes(dir);
}

/**
 * Find pieces that can attack a square via a ray
 * Returns all pieces that have a clear line to the target square
 */
export function findRayAttackers(
  pos: ChessPosition,
  targetSquare: string,
  attackerColor: Color,
): LocatedPiece[] {
  const attackers: LocatedPiece[] = [];
  const directions: Direction[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

  for (const dir of directions) {
    const firstPiece = getFirstPieceOnRay(pos, targetSquare, dir);
    if (!firstPiece || firstPiece.color !== attackerColor) continue;

    // Check if this piece type can attack in the opposite direction
    const attackDir = oppositeDirection(dir);
    if (canPieceMoveInDirection(firstPiece.type, attackDir)) {
      attackers.push(firstPiece);
    }
  }

  return attackers;
}

/**
 * Check if a square is on a ray between two squares
 */
export function isSquareOnRay(from: string, through: string, target: string): boolean {
  const dir1 = getDirection(from, through);
  const dir2 = getDirection(from, target);

  if (!dir1 || !dir2 || dir1 !== dir2) return false;

  // Target must be further than through
  const throughDist =
    Math.abs(fileIndex(through) - fileIndex(from)) + Math.abs(rankIndex(through) - rankIndex(from));
  const targetDist =
    Math.abs(fileIndex(target) - fileIndex(from)) + Math.abs(rankIndex(target) - rankIndex(from));

  return targetDist > throughDist;
}

/**
 * Get all squares a sliding piece can reach (without obstructions)
 */
export function getSlidingMoveSquares(
  pos: ChessPosition,
  from: string,
  pieceType: string,
  pieceColor: Color,
): string[] {
  const squares: string[] = [];
  const directions = getDirectionsForPiece(pieceType);

  for (const dir of directions) {
    const raySquares = getSquaresInDirection(from, dir);
    for (const sq of raySquares) {
      const piece = pos.getPiece(sq);
      if (!piece) {
        squares.push(sq);
      } else {
        // Can capture enemy pieces
        if (piece.color !== pieceColor) {
          squares.push(sq);
        }
        break; // Stop at first piece
      }
    }
  }

  return squares;
}

/**
 * Find pins: pieces that are blocking an attack on a more valuable piece
 *
 * @param pos - Chess position
 * @param attackerSquare - Square of the attacking piece
 * @param attackerColor - Color of the attacker
 * @returns Array of pins with pinned piece and protected piece
 */
export interface PinInfo {
  /** The pinned piece */
  pinnedPiece: LocatedPiece;
  /** The piece being protected behind the pin */
  protectedPiece: LocatedPiece;
  /** The attacking piece creating the pin */
  attacker: LocatedPiece;
  /** Direction of the pin ray */
  direction: Direction;
}

export function findPinsFromSquare(
  pos: ChessPosition,
  attackerSquare: string,
  attackerType: string,
  attackerColor: Color,
): PinInfo[] {
  const pins: PinInfo[] = [];
  const directions = getDirectionsForPiece(attackerType);
  const enemyColor = attackerColor === 'w' ? 'b' : 'w';

  for (const dir of directions) {
    const pieces = getPiecesOnRay(pos, attackerSquare, dir);

    // Need at least 2 pieces to have a pin
    if (pieces.length < 2) continue;

    // First piece must be enemy
    const firstPiece = pieces[0]!;
    if (firstPiece.color !== enemyColor) continue;

    // Second piece must also be enemy (and more valuable for relative pin)
    const secondPiece = pieces[1]!;
    if (secondPiece.color !== enemyColor) continue;

    // We have a pin!
    pins.push({
      pinnedPiece: firstPiece,
      protectedPiece: secondPiece,
      attacker: {
        type: attackerType,
        color: attackerColor,
        square: attackerSquare,
      },
      direction: dir,
    });
  }

  return pins;
}
