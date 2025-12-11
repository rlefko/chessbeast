import { Chess, type Square, type Color } from 'chess.js';

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

  /**
   * Convert a UCI move to SAN notation
   * @param uci - Move in UCI format (e.g., "e2e4", "e7e8q")
   * @returns Move in SAN format (e.g., "e4", "e8=Q")
   * @throws IllegalMoveError if the move is not legal
   */
  uciToSan(uci: string): string {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotionChar = uci[4];

    const fenBefore = this.chess.fen();
    try {
      // Build move object conditionally to satisfy exactOptionalPropertyTypes
      const moveObj: { from: string; to: string; promotion?: string } = { from, to };
      if (promotionChar) {
        moveObj.promotion = promotionChar;
      }
      const result = this.chess.move(moveObj);
      if (!result) {
        throw new IllegalMoveError(uci, fenBefore);
      }
      // Undo the move to keep position unchanged
      this.chess.undo();
      return result.san;
    } catch (err) {
      if (err instanceof IllegalMoveError) {
        throw err;
      }
      throw new IllegalMoveError(uci, fenBefore);
    }
  }

  /**
   * Convert a SAN move to UCI notation
   * @param san - Move in SAN format (e.g., "e4", "Nf3", "e8=Q")
   * @returns Move in UCI format (e.g., "e2e4", "g1f3", "e7e8q")
   * @throws IllegalMoveError if the move is not legal
   */
  sanToUci(san: string): string {
    const fenBefore = this.chess.fen();
    try {
      const result = this.chess.move(san);
      if (!result) {
        throw new IllegalMoveError(san, fenBefore);
      }
      // Undo the move to keep position unchanged
      this.chess.undo();
      // Build UCI string from from/to squares
      let uci = result.from + result.to;
      // Add promotion piece if applicable (lowercase)
      if (result.promotion) {
        uci += result.promotion;
      }
      return uci;
    } catch (err) {
      if (err instanceof IllegalMoveError) {
        throw err;
      }
      throw new IllegalMoveError(san, fenBefore);
    }
  }

  /**
   * Convert a sequence of UCI moves to SAN notation
   * Makes moves on a cloned position to get correct SAN for each move in context
   * @param uciMoves - Array of UCI moves
   * @param startingFen - Optional FEN of the starting position (defaults to current position)
   * @returns Array of SAN moves
   * @throws IllegalMoveError if any move is not legal
   */
  static convertPvToSan(uciMoves: string[], startingFen?: string): string[] {
    const pos = startingFen ? new ChessPosition(startingFen) : new ChessPosition();
    const sanMoves: string[] = [];

    for (const uci of uciMoves) {
      const san = pos.uciToSan(uci);
      sanMoves.push(san);
      // Make the move to update position for next conversion
      pos.move(san);
    }

    return sanMoves;
  }

  /**
   * Get the piece at a square
   * @param square - Square in algebraic notation (e.g., "e4")
   * @returns Piece object or undefined if empty
   */
  getPiece(square: string): { type: string; color: 'w' | 'b' } | undefined {
    const piece = this.chess.get(square as Square);
    if (!piece) return undefined;
    return { type: piece.type, color: piece.color };
  }

  /**
   * Check if a square is attacked by a specific color
   * @param square - Square in algebraic notation (e.g., "e4")
   * @param byColor - Color of the attacking side
   * @returns True if the square is attacked
   */
  isSquareAttacked(square: string, byColor: 'w' | 'b'): boolean {
    return this.chess.isAttacked(square as Square, byColor as Color);
  }

  /**
   * Get all squares that contain pieces attacking a specific square
   * @param square - Square in algebraic notation (e.g., "e4")
   * @param byColor - Optional color filter for attackers
   * @returns Array of squares containing attacking pieces
   */
  getAttackers(square: string, byColor?: 'w' | 'b'): string[] {
    return this.chess.attackers(square as Square, byColor as Color | undefined);
  }

  /**
   * Get the board as an 8x8 array
   * @returns 2D array where [0][0] is a8 and [7][7] is h1
   */
  board(): Array<Array<{ type: string; color: 'w' | 'b' } | null>> {
    return this.chess.board();
  }

  /**
   * Get all pieces on the board
   * @returns Array of pieces with their squares
   */
  getAllPieces(): Array<{ square: string; type: string; color: 'w' | 'b' }> {
    const pieces: Array<{ square: string; type: string; color: 'w' | 'b' }> = [];
    const board = this.chess.board();

    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank]![file];
        if (piece) {
          pieces.push({
            square: piece.square,
            type: piece.type,
            color: piece.color,
          });
        }
      }
    }

    return pieces;
  }
}
