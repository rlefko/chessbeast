/**
 * Piece Utilities
 *
 * Helper functions for working with chess pieces, including
 * piece values, naming, and movement patterns.
 */

import type { ChessPosition } from '@chessbeast/pgn';

import type { Color, LocatedPiece } from '../types.js';

import { fileIndex, rankIndex, squareFromIndices } from './square-utils.js';

/**
 * Standard piece values in centipawns
 * King value is set very high for relative pin calculations
 * Named THEME_PIECE_VALUES to avoid conflict with classifier PIECE_VALUES
 */
export const THEME_PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000, // Very high for pin calculations
};

/**
 * Get piece value in centipawns
 */
export function getPieceValue(pieceType: string): number {
  return THEME_PIECE_VALUES[pieceType.toLowerCase()] ?? 0;
}

/**
 * Get human-readable piece name
 */
export function pieceName(pieceType: string): string {
  const names: Record<string, string> = {
    p: 'pawn',
    n: 'knight',
    b: 'bishop',
    r: 'rook',
    q: 'queen',
    k: 'king',
  };
  return names[pieceType.toLowerCase()] ?? 'piece';
}

/**
 * Get piece symbol for notation
 */
export function pieceSymbol(pieceType: string): string {
  const symbols: Record<string, string> = {
    p: '',
    n: 'N',
    b: 'B',
    r: 'R',
    q: 'Q',
    k: 'K',
  };
  return symbols[pieceType.toLowerCase()] ?? '';
}

/**
 * Format piece with square (e.g., "Nf3", "e4" for pawn)
 */
export function formatPieceAtSquare(piece: LocatedPiece): string {
  return `${pieceSymbol(piece.type)}${piece.square}`;
}

/**
 * Check if piece is a sliding piece (bishop, rook, queen)
 */
export function isSlidingPiece(pieceType: string): boolean {
  return ['b', 'r', 'q'].includes(pieceType.toLowerCase());
}

/**
 * Check if piece is a major piece (rook, queen)
 */
export function isMajorPiece(pieceType: string): boolean {
  return ['r', 'q'].includes(pieceType.toLowerCase());
}

/**
 * Check if piece is a minor piece (knight, bishop)
 */
export function isMinorPiece(pieceType: string): boolean {
  return ['n', 'b'].includes(pieceType.toLowerCase());
}

/**
 * Find king location for a color
 */
export function findKing(pos: ChessPosition, color: Color): string | null {
  const pieces = pos.getAllPieces();
  const king = pieces.find((p) => p.type === 'k' && p.color === color);
  return king?.square ?? null;
}

/**
 * Get all pieces of a specific color
 */
export function getPiecesByColor(pos: ChessPosition, color: Color): LocatedPiece[] {
  return pos.getAllPieces().filter((p) => p.color === color) as LocatedPiece[];
}

/**
 * Get all sliding pieces (B, R, Q) for a color
 */
export function getSlidingPieces(pos: ChessPosition, color: Color): LocatedPiece[] {
  return getPiecesByColor(pos, color).filter((p) => isSlidingPiece(p.type));
}

/**
 * Get all major pieces (R, Q) for a color
 */
export function getMajorPieces(pos: ChessPosition, color: Color): LocatedPiece[] {
  return getPiecesByColor(pos, color).filter((p) => isMajorPiece(p.type));
}

/**
 * Get all minor pieces (N, B) for a color
 */
export function getMinorPieces(pos: ChessPosition, color: Color): LocatedPiece[] {
  return getPiecesByColor(pos, color).filter((p) => isMinorPiece(p.type));
}

/**
 * Get all pawns for a color
 */
export function getPawns(pos: ChessPosition, color: Color): LocatedPiece[] {
  return getPiecesByColor(pos, color).filter((p) => p.type === 'p');
}

/**
 * Get knight movement squares from a square
 */
export function getKnightMoves(from: string): string[] {
  const f = fileIndex(from);
  const r = rankIndex(from);
  const moves: string[] = [];

  const offsets = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ];

  for (const offset of offsets) {
    const sq = squareFromIndices(f + offset[0]!, r + offset[1]!);
    if (sq) moves.push(sq);
  }

  return moves;
}

/**
 * Get pawn capture squares (diagonal attacks)
 */
export function getPawnCaptureSquares(from: string, color: Color): string[] {
  const f = fileIndex(from);
  const r = rankIndex(from);
  const direction = color === 'w' ? 1 : -1;
  const squares: string[] = [];

  // Left capture
  const left = squareFromIndices(f - 1, r + direction);
  if (left) squares.push(left);

  // Right capture
  const right = squareFromIndices(f + 1, r + direction);
  if (right) squares.push(right);

  return squares;
}

/**
 * Get pawn defended squares (same as capture squares)
 */
export function getPawnDefendedSquares(pawnSquare: string, pawnColor: Color): string[] {
  return getPawnCaptureSquares(pawnSquare, pawnColor);
}

/**
 * Check if a pawn can potentially defend a square
 * (i.e., a pawn on an adjacent file could advance to defend)
 */
export function canPawnReachSquare(
  _pos: ChessPosition,
  pawnSquare: string,
  targetSquare: string,
  pawnColor: Color,
): boolean {
  const pawnFile = fileIndex(pawnSquare);
  const pawnRank = rankIndex(pawnSquare);
  const targetFile = fileIndex(targetSquare);
  const targetRank = rankIndex(targetSquare);

  // Must be on adjacent file
  if (Math.abs(pawnFile - targetFile) !== 1) return false;

  // Check if pawn can advance to the required rank
  if (pawnColor === 'w') {
    // White pawn must advance forward (higher ranks)
    return pawnRank < targetRank;
  } else {
    // Black pawn must advance forward (lower ranks)
    return pawnRank > targetRank;
  }
}

/**
 * Count defenders of a square
 */
export function countDefenders(pos: ChessPosition, square: string, defenderColor: Color): number {
  return pos.getAttackers(square, defenderColor).length;
}

/**
 * Count attackers of a square
 */
export function countAttackers(pos: ChessPosition, square: string, attackerColor: Color): number {
  return pos.getAttackers(square, attackerColor).length;
}

/**
 * Get all squares a piece can move to (legal moves from that square)
 * Note: This is an approximation - for accurate legal moves use pos.getLegalMoves()
 */
export function getAvailableMoveSquares(pos: ChessPosition, piece: LocatedPiece): string[] {
  const legalMoves = pos.getLegalMoves();
  const squares: string[] = [];

  // Filter legal moves that start from this piece's square
  for (const move of legalMoves) {
    // Parse the move to find destination
    // This is a simplified approach - matches moves starting with the piece notation
    const fromSquare = piece.square;
    const pieceNotation = pieceSymbol(piece.type);

    // For pawns, move starts with file or is just the destination
    if (piece.type === 'p') {
      if (move.startsWith(fromSquare[0]!)) {
        // Extract destination (last 2 chars before any promotion/check)
        const cleanMove = move.replace(/[+#]$/, '').replace(/=[QRBN]$/, '');
        const dest = cleanMove.slice(-2);
        if (dest.length === 2) squares.push(dest);
      }
    } else {
      // For pieces, move starts with piece letter
      if (move.startsWith(pieceNotation)) {
        const cleanMove = move.replace(/[+#]$/, '');
        // Check if this move is from our square (handles disambiguation)
        if (cleanMove.includes(fromSquare) || !cleanMove.match(/[a-h][1-8]/g)?.slice(0, -1)) {
          const dest = cleanMove.slice(-2);
          if (dest.length === 2) squares.push(dest);
        }
      }
    }
  }

  return [...new Set(squares)]; // Deduplicate
}

/**
 * Check if a piece has any safe squares to move to
 */
export function hasSafeSquare(pos: ChessPosition, piece: LocatedPiece): boolean {
  const enemyColor = piece.color === 'w' ? 'b' : 'w';
  const moveSquares = getAvailableMoveSquares(pos, piece);

  return moveSquares.some((sq) => !pos.isSquareAttacked(sq, enemyColor));
}

/**
 * Get the lowest value attacker of a square
 */
export function getLowestValueAttacker(
  pos: ChessPosition,
  square: string,
  attackerColor: Color,
): LocatedPiece | null {
  const attackers = pos.getAttackers(square, attackerColor);
  if (attackers.length === 0) return null;

  let lowestPiece: LocatedPiece | null = null;
  let lowestValue = Infinity;

  for (const attackerSquare of attackers) {
    const piece = pos.getPiece(attackerSquare);
    if (piece) {
      const value = getPieceValue(piece.type);
      if (value < lowestValue) {
        lowestValue = value;
        lowestPiece = { ...piece, square: attackerSquare };
      }
    }
  }

  return lowestPiece;
}

/**
 * Check if a piece is hanging (attacked more than defended, or by lower value)
 * Can accept either a LocatedPiece or a square string
 */
export function isHangingPiece(pos: ChessPosition, pieceOrSquare: LocatedPiece | string): boolean {
  // Handle string input (square)
  let piece: LocatedPiece;
  if (typeof pieceOrSquare === 'string') {
    const p = pos.getPiece(pieceOrSquare);
    if (!p) return false;
    piece = { ...p, square: pieceOrSquare };
  } else {
    piece = pieceOrSquare;
  }

  const enemyColor = piece.color === 'w' ? 'b' : 'w';

  // Not attacked = not hanging
  if (!pos.isSquareAttacked(piece.square, enemyColor)) return false;

  const attackers = countAttackers(pos, piece.square, enemyColor);
  const defenders = countDefenders(pos, piece.square, piece.color as Color);

  // More attackers than defenders = hanging
  if (attackers > defenders) return true;

  // Equal attackers/defenders, but lowest attacker is less valuable
  if (attackers > 0 && attackers === defenders) {
    const lowestAttacker = getLowestValueAttacker(pos, piece.square, enemyColor);
    if (lowestAttacker && getPieceValue(lowestAttacker.type) < getPieceValue(piece.type)) {
      return true;
    }
  }

  return false;
}
