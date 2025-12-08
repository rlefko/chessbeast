/**
 * Zobrist hashing tables for chess positions
 *
 * Zobrist hashing is a technique for efficiently computing position hashes
 * that can detect transpositions. Each (piece, square) combination gets a
 * random 64-bit value, and the position hash is the XOR of all such values.
 *
 * Benefits:
 * - O(1) incremental updates when making/unmaking moves
 * - High collision resistance with 64-bit values
 * - Same position always produces same hash (transposition detection)
 */

// Use BigInt for true 64-bit values
type ZobristValue = bigint;

/**
 * Piece indices for Zobrist table lookup
 * Order: white pieces (0-5), black pieces (6-11)
 */
export const PIECE_INDICES: Record<string, number> = {
  P: 0, // White pawn
  N: 1, // White knight
  B: 2, // White bishop
  R: 3, // White rook
  Q: 4, // White queen
  K: 5, // White king
  p: 6, // Black pawn
  n: 7, // Black knight
  b: 8, // Black bishop
  r: 9, // Black rook
  q: 10, // Black queen
  k: 11, // Black king
};

/**
 * Square indices for Zobrist table lookup (a1=0, h8=63)
 */
export function squareToIndex(square: string): number {
  const file = square.charCodeAt(0) - 97; // 'a' = 0
  const rank = parseInt(square[1]!) - 1; // '1' = 0
  return rank * 8 + file;
}

/**
 * Convert algebraic square (e.g., 'e4') to index (0-63)
 */
export function indexToSquare(index: number): string {
  const file = index % 8;
  const rank = Math.floor(index / 8);
  return String.fromCharCode(97 + file) + (rank + 1);
}

/**
 * Seed-based pseudo-random number generator for reproducible Zobrist values
 * Uses xorshift128+ algorithm for good statistical properties
 */
class ZobristRNG {
  private state0: bigint;
  private state1: bigint;

  constructor(seed: bigint = 0x853c49e6748fea9bn) {
    this.state0 = seed;
    this.state1 = seed ^ 0xda3e39cb94b95bdbn;
  }

  next(): bigint {
    let s1 = this.state0;
    const s0 = this.state1;
    this.state0 = s0;
    s1 ^= s1 << 23n;
    s1 ^= s1 >> 17n;
    s1 ^= s0;
    s1 ^= s0 >> 26n;
    this.state1 = s1;
    return (this.state0 + this.state1) & 0xffffffffffffffffn;
  }
}

/**
 * Generate Zobrist tables with deterministic seed for reproducibility
 * These values will be the same across all sessions
 */
function generateZobristTables(): {
  pieceSquare: ZobristValue[][];
  castling: ZobristValue[];
  enPassant: ZobristValue[];
  sideToMove: ZobristValue;
} {
  const rng = new ZobristRNG(0x12345678deadbeefn);

  // 12 pieces × 64 squares
  const pieceSquare: ZobristValue[][] = [];
  for (let piece = 0; piece < 12; piece++) {
    pieceSquare[piece] = [];
    for (let square = 0; square < 64; square++) {
      pieceSquare[piece]![square] = rng.next();
    }
  }

  // 16 castling combinations (4-bit flags: KQkq)
  const castling: ZobristValue[] = [];
  for (let i = 0; i < 16; i++) {
    castling[i] = rng.next();
  }

  // 9 en passant states (8 files + none)
  const enPassant: ZobristValue[] = [];
  for (let i = 0; i < 9; i++) {
    enPassant[i] = rng.next();
  }

  // Side to move (XOR when black to move)
  const sideToMove = rng.next();

  return { pieceSquare, castling, enPassant, sideToMove };
}

// Pre-compute tables at module load time
const tables = generateZobristTables();

/**
 * Zobrist values for (piece, square) combinations
 * Access: ZOBRIST_PIECE_SQUARE[pieceIndex][squareIndex]
 */
export const ZOBRIST_PIECE_SQUARE: readonly (readonly ZobristValue[])[] = tables.pieceSquare;

/**
 * Zobrist values for castling rights
 * Access: ZOBRIST_CASTLING[castlingFlags]
 * Flags: K=8, Q=4, k=2, q=1
 */
export const ZOBRIST_CASTLING: readonly ZobristValue[] = tables.castling;

/**
 * Zobrist values for en passant file
 * Access: ZOBRIST_EN_PASSANT[fileIndex] (0-7 for a-h, 8 for none)
 */
export const ZOBRIST_EN_PASSANT: readonly ZobristValue[] = tables.enPassant;

/**
 * Zobrist value to XOR when black is to move
 */
export const ZOBRIST_SIDE_TO_MOVE: ZobristValue = tables.sideToMove;

/**
 * Get piece index from FEN character
 */
export function getPieceIndex(piece: string): number {
  const index = PIECE_INDICES[piece];
  if (index === undefined) {
    throw new Error(`Invalid piece character: ${piece}`);
  }
  return index;
}

/**
 * Convert castling rights string to index (0-15)
 * e.g., 'KQkq' -> 15, 'Kk' -> 10, '-' -> 0
 */
export function getCastlingIndex(castling: string): number {
  if (castling === '-') return 0;

  let index = 0;
  if (castling.includes('K')) index |= 8;
  if (castling.includes('Q')) index |= 4;
  if (castling.includes('k')) index |= 2;
  if (castling.includes('q')) index |= 1;
  return index;
}

/**
 * Convert en passant square to file index (0-7) or 8 for none
 */
export function getEnPassantIndex(epSquare: string): number {
  if (epSquare === '-') return 8;
  return epSquare.charCodeAt(0) - 97; // 'a' -> 0
}

/**
 * Get Zobrist value for a piece on a square
 */
export function getZobristPieceSquare(piece: string, square: string): ZobristValue {
  const pieceIdx = getPieceIndex(piece);
  const squareIdx = squareToIndex(square);
  const value = ZOBRIST_PIECE_SQUARE[pieceIdx]?.[squareIdx];
  if (value === undefined) {
    throw new Error(`Invalid piece/square: ${piece}/${square}`);
  }
  return value;
}
