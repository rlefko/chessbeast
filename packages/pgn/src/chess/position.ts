import { Chess } from 'chess.js';

import { InvalidFenError, IllegalMoveError } from '../errors.js';

/**
 * Result of applying a move to a position
 */
export interface MoveResult {
  /** The move in Standard Algebraic Notation */
  san: string;
  /** FEN before the move was made */
  fenBefore: string;
  /** FEN after the move was made */
  fenAfter: string;
}

/**
 * Standard starting position FEN
 */
export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * A chess position wrapper around chess.js
 *
 * Provides a clean interface for position manipulation,
 * FEN handling, and move validation.
 */
export class ChessPosition {
  private chess: Chess;

  constructor(fen?: string) {
    if (fen) {
      try {
        this.chess = new Chess(fen);
      } catch {
        throw new InvalidFenError(`Invalid FEN: ${fen}`);
      }
    } else {
      this.chess = new Chess();
    }
  }

  /**
   * Create a position from the standard starting position
   */
  static startingPosition(): ChessPosition {
    return new ChessPosition();
  }

  /**
   * Create a position from a FEN string
   * @throws InvalidFenError if the FEN is invalid
   */
  static fromFen(fen: string): ChessPosition {
    return new ChessPosition(fen);
  }

  /**
   * Get the current position as a FEN string
   */
  fen(): string {
    return this.chess.fen();
  }

  /**
   * Apply a move in SAN notation
   * @throws IllegalMoveError if the move is not legal
   */
  move(san: string): MoveResult {
    const fenBefore = this.chess.fen();
    try {
      const result = this.chess.move(san);
      if (!result) {
        throw new IllegalMoveError(san, fenBefore);
      }
      return {
        san: result.san,
        fenBefore,
        fenAfter: this.chess.fen(),
      };
    } catch (err) {
      // chess.js throws Error for invalid moves, wrap in our custom error
      if (err instanceof IllegalMoveError) {
        throw err;
      }
      throw new IllegalMoveError(san, fenBefore);
    }
  }

  /**
   * Check if a move in SAN notation is legal
   */
  isLegalMove(san: string): boolean {
    const moves = this.chess.moves();
    return moves.includes(san);
  }

  /**
   * Get all legal moves in SAN notation
   */
  getLegalMoves(): string[] {
    return this.chess.moves();
  }

  /**
   * Get whose turn it is
   */
  turn(): 'w' | 'b' {
    return this.chess.turn();
  }

  /**
   * Get the current move number
   */
  moveNumber(): number {
    return this.chess.moveNumber();
  }

  /**
   * Check if the current side is in check
   */
  isCheck(): boolean {
    return this.chess.isCheck();
  }

  /**
   * Check if the current side is checkmated
   */
  isCheckmate(): boolean {
    return this.chess.isCheckmate();
  }

  /**
   * Check if the position is stalemate
   */
  isStalemate(): boolean {
    return this.chess.isStalemate();
  }

  /**
   * Check if the position is a draw (stalemate, insufficient material, 50-move, or threefold)
   */
  isDraw(): boolean {
    return this.chess.isDraw();
  }

  /**
   * Check if the game is over (checkmate, stalemate, or draw)
   */
  isGameOver(): boolean {
    return this.chess.isGameOver();
  }

  /**
   * Create a copy of this position
   */
  clone(): ChessPosition {
    return new ChessPosition(this.fen());
  }
}
