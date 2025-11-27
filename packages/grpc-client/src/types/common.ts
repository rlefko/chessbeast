/**
 * Common types shared between services
 * Matches definitions in services/protos/common.proto
 */

/**
 * A chess position represented as a FEN string
 */
export interface Position {
  fen: string;
}

/**
 * A chess move with both notation formats
 */
export interface Move {
  /** Standard Algebraic Notation (e.g., "Nf3") */
  san: string;
  /** UCI format (e.g., "g1f3") */
  uci: string;
}
