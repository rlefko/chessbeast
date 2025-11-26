/**
 * @chessbeast/pgn - PGN parsing and rendering for ChessBeast
 *
 * This package handles:
 * - PGN tag parsing (Event, White, Black, Result, etc.)
 * - Move text parsing (SAN notation)
 * - Comment and variation handling
 * - PGN rendering with annotations
 */

export const VERSION = '0.1.0';

/**
 * Game metadata from PGN headers
 */
export interface GameMetadata {
  event?: string;
  site?: string;
  date?: string;
  round?: string;
  white: string;
  black: string;
  result: string;
  whiteElo?: number;
  blackElo?: number;
  timeControl?: string;
  eco?: string;
}

/**
 * A single move with position information
 */
export interface MoveInfo {
  moveNumber: number;
  san: string;
  isWhiteMove: boolean;
  fenBefore: string;
  fenAfter: string;
}

/**
 * A fully parsed game
 */
export interface ParsedGame {
  metadata: GameMetadata;
  moves: MoveInfo[];
}

/**
 * Placeholder for the PGN parser
 */
export function parsePgn(_pgn: string): ParsedGame[] {
  console.log('PGN parser not yet implemented');
  return [];
}

/**
 * Placeholder for the PGN renderer
 */
export function renderPgn(_game: ParsedGame): string {
  console.log('PGN renderer not yet implemented');
  return '';
}
