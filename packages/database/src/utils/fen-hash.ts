/**
 * FEN hashing utilities for efficient position lookup
 */

/**
 * Normalize a FEN string by removing move counters.
 * This allows matching positions regardless of move history.
 *
 * FEN format: "position turn castling enPassant halfmove fullmove"
 * We keep only: "position turn castling enPassant"
 *
 * @param fen - Full FEN string
 * @returns Normalized FEN without move counters
 */
export function normalizeFen(fen: string): string {
  const parts = fen.split(' ');
  // Keep only position, turn, castling rights, and en passant
  return parts.slice(0, 4).join(' ');
}

/**
 * Create a base64 hash of a normalized FEN for database lookup.
 * Uses the normalized FEN (without move counters) to match positions
 * regardless of how they were reached.
 *
 * @param fen - Full FEN string
 * @returns Base64-encoded hash for database lookup
 */
export function hashFen(fen: string): string {
  const normalized = normalizeFen(fen);
  // Use base64url encoding for URL-safe strings
  return Buffer.from(normalized).toString('base64url');
}

/**
 * Decode a FEN hash back to the normalized FEN string.
 *
 * @param hash - Base64-encoded FEN hash
 * @returns Normalized FEN string
 */
export function unhashFen(hash: string): string {
  return Buffer.from(hash, 'base64url').toString('utf-8');
}
