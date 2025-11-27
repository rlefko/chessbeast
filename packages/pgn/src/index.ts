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
 * A single move with position information and optional annotations
 */
export interface MoveInfo {
  moveNumber: number;
  san: string;
  isWhiteMove: boolean;
  fenBefore: string;
  fenAfter: string;
  /** Comment appearing before the move */
  commentBefore?: string;
  /** Comment appearing after the move */
  commentAfter?: string;
  /** NAG symbols (e.g., ["$1", "$18"]) */
  nags?: string[];
  /** Variations (alternative lines) branching from this move */
  variations?: MoveInfo[][];
}

/**
 * A fully parsed game
 */
export interface ParsedGame {
  metadata: GameMetadata;
  moves: MoveInfo[];
  /** Comment appearing before the first move (game-level comment) */
  gameComment?: string;
}

// Re-export parsing functions
export { parsePgnString as parsePgn } from './parser/pgn-parser.js';

// Re-export rendering functions
export {
  renderPgnString as renderPgn,
  wrapMoveText,
  DEFAULT_MAX_LINE_LENGTH,
} from './renderer/pgn-renderer.js';
export type { RenderOptions } from './renderer/pgn-renderer.js';

// Re-export chess position utilities
export { ChessPosition, STARTING_FEN } from './chess/position.js';
export type { MoveResult } from './chess/position.js';

// Re-export tension resolution utilities
export { resolveVariationLength, hasTacticalTension } from './chess/tension-resolver.js';
export type { TensionConfig } from './chess/tension-resolver.js';

// Re-export error types
export { PgnParseError, InvalidFenError, IllegalMoveError } from './errors.js';

// Re-export NAG utilities
export type { MoveClassification } from './nag/index.js';

export {
  VALID_NAGS,
  MOVE_QUALITY_NAGS,
  isValidNag,
  normalizeNag,
  classificationToNag,
  filterValidNags,
  getNagDescription,
  getNagSymbol,
} from './nag/index.js';

// Re-export transformer utilities
export type {
  TransformOptions,
  GameAnalysisInput,
  GameAnalysisMetadata,
  MoveAnalysisInput,
  AlternativeMove,
  EngineEvaluation,
  AnalysisMetadata,
} from './transformer/index.js';

export { transformAnalysisToGame, hasAnnotations, countAnnotations } from './transformer/index.js';
