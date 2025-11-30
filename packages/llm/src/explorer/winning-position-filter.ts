/**
 * Winning Position Filter
 *
 * Assesses whether a position is worth exploring based on game state.
 * In decided positions (≥500cp), we only explore if there's:
 * - Counterplay (tactical tension)
 * - Trap potential (player made suboptimal move)
 * - Quick mate available (≤10 moves)
 */

import type { MoveClassification } from '@chessbeast/core';
import { ChessPosition, detectTension } from '@chessbeast/pgn';

/**
 * Result of exploration worthiness assessment
 */
export interface ExplorationWorthiness {
  /** Whether this position should be explored */
  shouldExplore: boolean;
  /** Human-readable reason for the decision */
  reason: string;
  /** Priority level for exploration */
  priority: 'high' | 'medium' | 'low' | 'skip';
  /** Budget multiplier (0.0-1.0) to apply to max tool calls */
  budgetMultiplier: number;
}

/** Threshold for considering a position "decided" (5 pawns) */
const DECIDED_THRESHOLD = 500;

/** Maximum mate distance to consider "quick" and worth showing */
const QUICK_MATE_THRESHOLD = 10;

/**
 * Assess whether a position is worth exploring with the agentic explorer
 *
 * @param fen - Position FEN string
 * @param evalCp - Engine evaluation in centipawns
 * @param evalMate - Mate-in-N value (if forced mate exists)
 * @param classification - Move classification (blunder, mistake, etc.)
 * @param playedMove - The move that was played (SAN notation)
 * @param bestMove - Engine's best move (SAN notation)
 * @returns Exploration worthiness assessment
 */
export function assessExplorationWorthiness(
  fen: string,
  evalCp: number,
  evalMate: number | undefined,
  classification: MoveClassification,
  playedMove: string,
  bestMove: string,
): ExplorationWorthiness {
  const absEval = Math.abs(evalCp);

  // Not decided - always explore critical moments normally
  if (absEval < DECIDED_THRESHOLD && evalMate === undefined) {
    return {
      shouldExplore: true,
      reason: 'Position not decided',
      priority: 'high',
      budgetMultiplier: 1.0,
    };
  }

  // Quick mate available - worth showing the mating pattern
  if (evalMate !== undefined && Math.abs(evalMate) <= QUICK_MATE_THRESHOLD) {
    return {
      shouldExplore: true,
      reason: `Mate in ${Math.abs(evalMate)}`,
      priority: 'high',
      budgetMultiplier: 0.5,
    };
  }

  // Long mate - technical and not instructive
  if (evalMate !== undefined && Math.abs(evalMate) > QUICK_MATE_THRESHOLD) {
    return {
      shouldExplore: false,
      reason: 'Long mate not instructive',
      priority: 'skip',
      budgetMultiplier: 0,
    };
  }

  // Check for counterplay (tactical tension in the position)
  try {
    const pos = new ChessPosition(fen);
    const tension = detectTension(pos);

    if (tension.hasTension) {
      return {
        shouldExplore: true,
        reason: `Counterplay: ${tension.reasons[0]}`,
        priority: 'medium',
        budgetMultiplier: 0.7,
      };
    }
  } catch {
    // If position parsing fails, continue with other checks
  }

  // Error in winning position - worth exploring to show the trap
  if (classification === 'blunder' || classification === 'mistake') {
    return {
      shouldExplore: true,
      reason: 'Error in winning position',
      priority: 'medium',
      budgetMultiplier: 0.6,
    };
  }

  // Suboptimal move (differs from best) - potential trap or missed opportunity
  if (playedMove !== bestMove) {
    return {
      shouldExplore: true,
      reason: 'Suboptimal move - trap potential',
      priority: 'low',
      budgetMultiplier: 0.4,
    };
  }

  // Quiet decided position with best move played - not worth exploring
  return {
    shouldExplore: false,
    reason: 'Quiet decided position',
    priority: 'skip',
    budgetMultiplier: 0,
  };
}
