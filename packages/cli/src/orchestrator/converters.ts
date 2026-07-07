/**
 * Type conversion utilities for the analysis orchestrator
 * Extracted for SRP compliance
 */

import type { ParsedGameInput } from '@chessbeast/core';
import type { ParsedGame, MoveInfo } from '@chessbeast/pgn';

/**
 * Convert ParsedGame to ParsedGameInput for the analysis pipeline
 */
export function toAnalysisInput(game: ParsedGame): ParsedGameInput {
  const metadata: ParsedGameInput['metadata'] = {
    white: game.metadata.white,
    black: game.metadata.black,
    result: game.metadata.result,
  };

  // Only add optional properties if they're defined
  if (game.metadata.event !== undefined) metadata.event = game.metadata.event;
  if (game.metadata.date !== undefined) metadata.date = game.metadata.date;
  if (game.metadata.eco !== undefined) metadata.eco = game.metadata.eco;
  if (game.metadata.whiteElo !== undefined) metadata.whiteElo = game.metadata.whiteElo;
  if (game.metadata.blackElo !== undefined) metadata.blackElo = game.metadata.blackElo;

  return {
    metadata,
    moves: game.moves.map((move: MoveInfo) => ({
      san: move.san,
      fenBefore: move.fenBefore,
      fenAfter: move.fenAfter,
      moveNumber: move.moveNumber,
      isWhiteMove: move.isWhiteMove,
    })),
  };
}
