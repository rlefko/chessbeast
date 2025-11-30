/**
 * Board Visualization for LLM Comprehension
 *
 * Renders chess positions as ASCII boards that LLMs can parse and understand.
 * Uses brackets to distinguish pieces from empty squares.
 */

import { ChessPosition } from './position.js';

/**
 * Board orientation perspective
 */
export type Perspective = 'white' | 'black';

/**
 * Options for board rendering
 */
export interface BoardRenderOptions {
  /** Board orientation (default: 'white') */
  perspective?: Perspective;
  /** Highlight the last move played */
  lastMove?: { from: string; to: string; san: string };
}

/**
 * Render a chess position as an ASCII board
 *
 * Example output:
 * ```
 *    a   b   c   d   e   f   g   h
 * 8 [r] [n] [b] [q] [k] [b] [n] [r]  8
 * 7 [p] [p] [p] [p] [p] [p] [p] [p]  7
 * 6  .   .   .   .   .   .   .   .   6
 * 5  .   .   .   .   .   .   .   .   5
 * 4  .   .   .   .  [P]  .   .   .   4
 * 3  .   .   .   .   .   .   .   .   3
 * 2 [P] [P] [P] [P]  .  [P] [P] [P]  2
 * 1 [R] [N] [B] [Q] [K] [B] [N] [R]  1
 *    a   b   c   d   e   f   g   h
 * ```
 *
 * Design choices:
 * - Brackets `[piece]` distinguish pieces from empty squares
 * - Uppercase = White, lowercase = black (standard FEN convention)
 * - Dots `.` for empty squares provide visual rhythm
 * - File/rank labels on both sides for easy reference
 *
 * @param fen - FEN string of the position to render
 * @param options - Rendering options
 * @returns ASCII board string
 */
export function renderBoard(fen: string, options?: BoardRenderOptions): string {
  const perspective = options?.perspective ?? 'white';

  // Parse FEN to get board state
  const pos = new ChessPosition(fen);
  const board = pos.board();

  // File labels based on perspective
  const files =
    perspective === 'white'
      ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
      : ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];

  // Rank order based on perspective
  const rankIndices = perspective === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];

  const lines: string[] = [];

  // Header with file labels
  lines.push(`   ${files.join('   ')}`);

  // Board rows
  for (const rankIdx of rankIndices) {
    const rankNum = 8 - rankIdx;
    const squares: string[] = [];

    for (let fileIdx = 0; fileIdx < 8; fileIdx++) {
      const actualFileIdx = perspective === 'white' ? fileIdx : 7 - fileIdx;
      const piece = board[rankIdx]![actualFileIdx];

      if (piece) {
        // Render piece with brackets
        const symbol = piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase();
        squares.push(`[${symbol}]`);
      } else {
        // Empty square
        squares.push(' . ');
      }
    }

    lines.push(`${rankNum} ${squares.join(' ')}  ${rankNum}`);
  }

  // Footer with file labels
  lines.push(`   ${files.join('   ')}`);

  return lines.join('\n');
}

/**
 * Format a board with metadata for inclusion in LLM prompts
 *
 * FEN is presented as the primary representation since LLMs understand
 * FEN notation well. The ASCII board is included as a supplementary
 * visual aid.
 *
 * @param fen - FEN string of the position
 * @param options - Rendering options
 * @returns Formatted string with FEN (primary) and board (supplementary)
 */
export function formatBoardForPrompt(
  fen: string,
  options?: BoardRenderOptions & { includeFen?: boolean; includeBoard?: boolean },
): string {
  const parts: string[] = [];

  // Parse FEN for metadata
  const pos = new ChessPosition(fen);
  const turn = pos.turn();

  // FEN is primary representation (LLMs understand it well)
  if (options?.includeFen !== false) {
    parts.push(`FEN: ${fen}`);
  }

  // Side to move
  parts.push(`Side to move: ${turn === 'w' ? 'White' : 'Black'}`);

  // Add last move if provided
  if (options?.lastMove) {
    parts.push(`Last move: ${options.lastMove.san}`);
  }

  // ASCII board as supplementary visual aid (optional, default: include)
  if (options?.includeBoard !== false) {
    parts.push('');
    parts.push('Board:');
    parts.push(renderBoard(fen, options));
  }

  return parts.join('\n');
}
