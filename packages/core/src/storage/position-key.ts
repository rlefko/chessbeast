/**
 * Position key generation using Zobrist hashing
 *
 * Position keys uniquely identify chess positions for:
 * - Cache lookups (engine evals, themes, candidates)
 * - Transposition detection in variation trees
 * - Cross-session consistency
 *
 * Key format: "<zobrist_hex>:<normalized_fen>"
 * Example: "9a1c3f2e4b8d7c6a:rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3"
 */

import {
  ZOBRIST_PIECE_SQUARE,
  ZOBRIST_CASTLING,
  ZOBRIST_EN_PASSANT,
  ZOBRIST_SIDE_TO_MOVE,
  getPieceIndex,
  getCastlingIndex,
  getEnPassantIndex,
} from './zobrist-tables.js';

/**
 * Position key combining Zobrist hash with normalized FEN
 */
export interface PositionKey {
  /** 64-bit Zobrist hash as 16-character hex string */
  zobrist: string;
  /** Normalized FEN (position + turn + castling + en passant, no move counters) */
  normalizedFen: string;
  /** Combined key string for storage: "<zobrist>:<normalizedFen>" */
  key: string;
}

/**
 * Normalize FEN by removing halfmove clock and fullmove number
 * These don't affect position evaluation or transposition detection
 *
 * @param fen - Full FEN string
 * @returns Normalized FEN with only first 4 fields
 *
 * @example
 * normalizeFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')
 * // Returns: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3'
 */
export function normalizeFen(fen: string): string {
  const parts = fen.split(' ');
  if (parts.length < 4) {
    throw new Error(`Invalid FEN: expected at least 4 parts, got ${parts.length}`);
  }
  return parts.slice(0, 4).join(' ');
}

/**
 * Compute Zobrist hash from a FEN string
 *
 * The hash is computed by XORing:
 * - Piece-square values for all pieces on the board
 * - Castling rights value
 * - En passant file value
 * - Side-to-move value (if black)
 *
 * @param fen - FEN string (can be full or normalized)
 * @returns 64-bit Zobrist hash as BigInt
 */
export function computeZobristHash(fen: string): bigint {
  const parts = fen.split(' ');
  const board = parts[0];
  const turn = parts[1];
  const castling = parts[2] ?? '-';
  const enPassant = parts[3] ?? '-';

  if (!board || !turn) {
    throw new Error('Invalid FEN: missing board or turn');
  }

  let hash = 0n;

  // Parse board and XOR piece-square values
  let square = 0;
  for (const char of board) {
    if (char === '/') {
      continue;
    }

    if (char >= '1' && char <= '8') {
      // Empty squares
      square += parseInt(char);
      continue;
    }

    // Piece on square
    const pieceIndex = getPieceIndex(char);
    // FEN starts from rank 8 (a8), but Zobrist indices are a1=0
    // Convert: FEN square index to actual square index
    const rank = 7 - Math.floor(square / 8);
    const file = square % 8;
    const zobristSquare = rank * 8 + file;

    const pieceSquareValue = ZOBRIST_PIECE_SQUARE[pieceIndex]?.[zobristSquare];
    if (pieceSquareValue === undefined) {
      throw new Error(`Missing Zobrist value for piece ${pieceIndex} on square ${zobristSquare}`);
    }
    hash ^= pieceSquareValue;
    square++;
  }

  // XOR castling rights
  const castlingValue = ZOBRIST_CASTLING[getCastlingIndex(castling)];
  if (castlingValue === undefined) {
    throw new Error(`Missing Zobrist value for castling ${castling}`);
  }
  hash ^= castlingValue;

  // XOR en passant file
  const epValue = ZOBRIST_EN_PASSANT[getEnPassantIndex(enPassant)];
  if (epValue === undefined) {
    throw new Error(`Missing Zobrist value for en passant ${enPassant}`);
  }
  hash ^= epValue;

  // XOR side to move (only for black)
  if (turn === 'b') {
    hash ^= ZOBRIST_SIDE_TO_MOVE;
  }

  return hash;
}

/**
 * Generate a complete PositionKey from a FEN string
 *
 * @param fen - FEN string (full or normalized)
 * @returns PositionKey with zobrist hash, normalized FEN, and combined key
 *
 * @example
 * const key = generatePositionKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
 * // key.zobrist = '0123456789abcdef' (example)
 * // key.normalizedFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3'
 * // key.key = '0123456789abcdef:rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3'
 */
export function generatePositionKey(fen: string): PositionKey {
  const normalizedFen = normalizeFen(fen);
  const zobristHash = computeZobristHash(normalizedFen);
  const zobristHex = zobristHash.toString(16).padStart(16, '0');

  return {
    zobrist: zobristHex,
    normalizedFen,
    key: `${zobristHex}:${normalizedFen}`,
  };
}

/**
 * Parse a position key string back into its components
 *
 * @param key - Combined position key string
 * @returns PositionKey object or null if invalid
 */
export function parsePositionKey(key: string): PositionKey | null {
  const colonIndex = key.indexOf(':');
  if (colonIndex === -1 || colonIndex !== 16) {
    return null;
  }

  const zobrist = key.slice(0, 16);
  const normalizedFen = key.slice(17);

  if (!/^[0-9a-f]{16}$/.test(zobrist)) {
    return null;
  }

  return {
    zobrist,
    normalizedFen,
    key,
  };
}

/**
 * Check if two position keys represent the same position
 * Uses Zobrist hash for fast comparison, falls back to FEN if collision suspected
 *
 * @param a - First position key
 * @param b - Second position key
 * @returns true if positions are identical
 */
export function positionKeysEqual(a: PositionKey, b: PositionKey): boolean {
  // Fast path: compare zobrist hashes
  if (a.zobrist !== b.zobrist) {
    return false;
  }

  // Collision check: compare normalized FENs
  return a.normalizedFen === b.normalizedFen;
}

/**
 * Extract just the zobrist hash from a position key for fast lookups
 *
 * @param key - Position key string or object
 * @returns 16-character hex zobrist hash
 */
export function getZobristFromKey(key: string | PositionKey): string {
  if (typeof key === 'string') {
    return key.slice(0, 16);
  }
  return key.zobrist;
}

/**
 * Create a position key from zobrist and FEN components
 * Useful when you've already computed the hash incrementally
 *
 * @param zobrist - 64-bit zobrist hash as hex string
 * @param normalizedFen - Normalized FEN string
 * @returns PositionKey object
 */
export function createPositionKey(zobrist: string, normalizedFen: string): PositionKey {
  return {
    zobrist,
    normalizedFen,
    key: `${zobrist}:${normalizedFen}`,
  };
}

/**
 * Starting position key (for convenience)
 */
export const STARTING_POSITION_KEY = generatePositionKey(
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
);
