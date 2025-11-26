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

// Re-export parsing functions
export { parsePgnString as parsePgn } from './parser/pgn-parser.js';

// Re-export rendering functions
export { renderPgnString as renderPgn } from './renderer/pgn-renderer.js';

// Re-export chess position utilities
export { ChessPosition, STARTING_FEN } from './chess/position.js';
export type { MoveResult } from './chess/position.js';

// Re-export error types
export { PgnParseError, InvalidFenError, IllegalMoveError } from './errors.js';
