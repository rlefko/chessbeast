/**
 * Move Classification Logic
 *
 * Classifies moves based on centipawn loss and other factors,
 * using rating-dependent thresholds.
 */

import type { MoveClassification } from '../index.js';
import type { EngineEvaluation, NormalizedEval } from '../types/analysis.js';

import {
  getInterpolatedThresholds,
  DEFAULT_RATING,
  getPositionStatus,
  isDecidedPosition,
  type ClassificationThresholds,
  type PositionStatus,
} from './thresholds.js';

/**
 * Options for move classification
 */
export interface ClassifyMoveOptions {
  /** Player's rating (or estimated rating) */
  rating?: number;
  /** Number of legal moves in the position */
  legalMoveCount?: number;
  /** Is this an opening book move? */
  isBookMove?: boolean;
  /** Human probability of playing this move (from Maia) */
  humanProbability?: number;
  /** Is this a sacrifice? */
  isSacrifice?: boolean;
}

/**
 * Result of move classification
 */
export interface ClassificationResult {
  /** The classification */
  classification: MoveClassification;
  /** Centipawn loss */
  cpLoss: number;
  /** Whether the move was forced (only reasonable option) */
  isForced: boolean;
  /** Whether the move should be considered brilliant */
  isBrilliant: boolean;
  /** Original classification before position-aware adjustment (if adjusted) */
  rawClassification?: MoveClassification;
  /** Whether the classification was adjusted due to position context */
  wasAdjusted?: boolean;
  /** Position status before the move (from player's perspective) */
  statusBefore?: PositionStatus;
  /** Position status after the move (from player's perspective) */
  statusAfter?: PositionStatus;
}

/**
 * Normalize an engine evaluation that is already from the side-to-move's perspective
 *
 * Note: The Stockfish service returns evaluations from the side-to-move's perspective,
 * so this function simply handles mate score conversion to centipawn-equivalent values.
 *
 * @param eval_ - Engine evaluation (already from side-to-move's perspective)
 * @returns Normalized evaluation with mate scores converted to cp-equivalent
 */
function normalizeEvalSideToMove(eval_: EngineEvaluation): NormalizedEval {
  if (eval_.mate !== undefined) {
    const mate = eval_.mate;
    // mate > 0 = side to move delivers mate
    // mate < 0 = side to move gets mated
    return {
      cp: mate > 0 ? 100000 - mate * 100 : -100000 - mate * 100,
      isMate: true,
      mateIn: Math.abs(mate),
    };
  }
  return {
    cp: eval_.cp ?? 0,
    isMate: false,
  };
}

/**
 * Normalize an engine evaluation (legacy function, kept for API compatibility)
 *
 * Note: The Stockfish service already returns evaluations from the side-to-move's
 * perspective, so the isWhiteToMove parameter is no longer used. This function
 * now simply delegates to normalizeEvalSideToMove.
 *
 * @param eval_ - Engine evaluation (already from side-to-move's perspective)
 * @param _isWhiteToMove - Unused, kept for API compatibility
 * @returns Normalized evaluation (positive = side to move is better)
 */
export function normalizeEval(eval_: EngineEvaluation, _isWhiteToMove: boolean): NormalizedEval {
  return normalizeEvalSideToMove(eval_);
}

/**
 * Calculate centipawn loss between two evaluations
 *
 * The Stockfish service returns evaluations from the side-to-move's perspective:
 * - evalBefore.cp: From the moving player's perspective (positive = good for them)
 * - evalAfter.cp: From the opponent's perspective (positive = good for opponent)
 *
 * To calculate cpLoss, we need both from the moving player's perspective:
 * - cpLoss = cpBefore - (-cpAfter) = cpBefore + cpAfter
 *
 * @param evalBefore - Evaluation of position before move (from moving player's perspective)
 * @param evalAfter - Evaluation of position after move (from opponent's perspective)
 * @param _isWhiteMove - Unused, kept for API compatibility
 * @returns Centipawn loss (0 or positive number)
 */
export function calculateCpLoss(
  evalBefore: EngineEvaluation,
  evalAfter: EngineEvaluation,
  _isWhiteMove: boolean,
): number {
  // Handle mate scores by converting to cp-equivalent values
  const normBefore = normalizeEvalSideToMove(evalBefore);
  const normAfter = normalizeEvalSideToMove(evalAfter);

  // evalBefore is from player's perspective (player to move)
  // evalAfter is from opponent's perspective (opponent to move)
  // To get evalAfter from player's perspective, negate it
  const afterFromPlayerView = -normAfter.cp;

  // CPLoss = eval_before - eval_after (both from player's perspective)
  // Positive CPLoss means the move made position worse
  const cpLoss = normBefore.cp - afterFromPlayerView;

  // Never return negative (that would mean move was better than best)
  return Math.max(0, cpLoss);
}

/**
 * Determine if a move is forced (only reasonable option)
 *
 * @param cpLoss - Centipawn loss of the move
 * @param legalMoveCount - Number of legal moves
 * @param alternatives - Top alternative moves and their CP losses
 * @returns Whether the move is forced
 */
export function isForcedMove(
  cpLoss: number,
  legalMoveCount?: number,
  alternatives?: Array<{ cpLoss: number }>,
): boolean {
  // If only 1-2 legal moves, it's forced
  if (legalMoveCount !== undefined && legalMoveCount <= 2) {
    return true;
  }

  // If all alternatives are significantly worse, it's forced
  if (alternatives && alternatives.length > 0) {
    const worstAlternative = Math.min(...alternatives.map((a) => a.cpLoss));
    // If best alternative loses at least 100cp more, consider forced
    if (worstAlternative - cpLoss >= 100) {
      return true;
    }
  }

  // If played the best move with 0 cpLoss
  if (cpLoss === 0 && legalMoveCount !== undefined && legalMoveCount <= 5) {
    return true;
  }

  return false;
}

/**
 * Determine if a move should be considered brilliant
 *
 * A brilliant move meets these criteria:
 * - Low centipawn loss (good or excellent move)
 * - Low human probability (surprising/unintuitive)
 * - Optionally involves a sacrifice
 *
 * @param cpLoss - Centipawn loss
 * @param humanProbability - Probability from Maia (0-1)
 * @param isSacrifice - Whether the move involves a sacrifice
 * @param thresholds - Classification thresholds
 * @returns Whether the move is brilliant
 */
export function isBrilliantMove(
  cpLoss: number,
  humanProbability?: number,
  isSacrifice?: boolean,
  thresholds?: ClassificationThresholds,
): boolean {
  const t = thresholds ?? getInterpolatedThresholds(DEFAULT_RATING);

  // Must be a good move (low cpLoss)
  if (cpLoss > t.goodThreshold) {
    return false;
  }

  // If human probability is available, must be surprising
  if (humanProbability !== undefined) {
    // Lower probability = more surprising
    // For brilliant, require < 15% probability
    if (humanProbability > 0.15) {
      return false;
    }
  }

  // Bonus for sacrifices
  if (isSacrifice) {
    // Sacrifices with low cpLoss and decent surprise are brilliant
    return humanProbability === undefined || humanProbability < 0.25;
  }

  // Non-sacrifice brilliant moves need to be very surprising
  return humanProbability !== undefined && humanProbability < 0.08;
}

/**
 * Classify a move based on centipawn loss and other factors
 *
 * @param evalBefore - Evaluation before the move
 * @param evalAfter - Evaluation after the move
 * @param isWhiteMove - Did white make this move?
 * @param options - Additional classification options
 * @returns Classification result
 */
export function classifyMove(
  evalBefore: EngineEvaluation,
  evalAfter: EngineEvaluation,
  isWhiteMove: boolean,
  options: ClassifyMoveOptions = {},
): ClassificationResult {
  const {
    rating = DEFAULT_RATING,
    isBookMove,
    humanProbability,
    isSacrifice,
    legalMoveCount,
  } = options;

  // Book moves are always classified as 'book'
  if (isBookMove) {
    return {
      classification: 'book',
      cpLoss: 0,
      isForced: false,
      isBrilliant: false,
    };
  }

  // Calculate CP loss
  const cpLoss = calculateCpLoss(evalBefore, evalAfter, isWhiteMove);

  // Get thresholds for this rating
  const thresholds = getInterpolatedThresholds(rating);

  // Check if move is forced
  const isForced = isForcedMove(cpLoss, legalMoveCount);

  // Check if move is brilliant
  const isBrilliant = isBrilliantMove(cpLoss, humanProbability, isSacrifice, thresholds);

  // Determine classification based on cpLoss
  let classification: MoveClassification;

  if (isForced) {
    classification = 'forced';
  } else if (isBrilliant) {
    classification = 'brilliant';
  } else if (cpLoss >= thresholds.blunderThreshold) {
    classification = 'blunder';
  } else if (
    cpLoss >= thresholds.mistakeRange[0] &&
    cpLoss < thresholds.mistakeRange[1] + (thresholds.blunderThreshold - thresholds.mistakeRange[1])
  ) {
    classification = 'mistake';
  } else if (cpLoss >= thresholds.inaccuracyRange[0] && cpLoss < thresholds.mistakeRange[0]) {
    classification = 'inaccuracy';
  } else if (cpLoss <= thresholds.excellentThreshold) {
    classification = 'excellent';
  } else if (cpLoss <= thresholds.goodThreshold) {
    classification = 'good';
  } else {
    // Between good threshold and inaccuracy threshold
    classification = 'good';
  }

  // Position-aware classification adjustment
  // evalBefore is from player's perspective, evalAfter is from opponent's perspective
  const normBefore =
    evalBefore.mate !== undefined ? (evalBefore.mate > 0 ? 10000 : -10000) : (evalBefore.cp ?? 0);
  const normAfter =
    evalAfter.mate !== undefined ? (evalAfter.mate > 0 ? 10000 : -10000) : (evalAfter.cp ?? 0);
  // Convert evalAfter to player's perspective (negate since it's from opponent's view)
  const cpAfterFromPlayer = -normAfter;

  const statusBefore = getPositionStatus(normBefore);
  const statusAfter = getPositionStatus(cpAfterFromPlayer);

  const isDecidedBefore = isDecidedPosition(statusBefore);
  const isDecidedAfter = isDecidedPosition(statusAfter);

  // Only adjust if position was decided and still is in same category
  // (both decisive or both lost - meaning same side is still winning)
  const sameDecidedCategory =
    (statusBefore === 'decisive' && statusAfter === 'decisive') ||
    (statusBefore === 'lost' && statusAfter === 'lost');

  let wasAdjusted = false;
  const rawClassification = classification;

  if (sameDecidedCategory && isDecidedBefore && isDecidedAfter) {
    // Position was decided and still is in the same winning/losing state
    // Downgrade penalties since the game outcome is unchanged
    if (classification === 'blunder') {
      classification = 'mistake';
      wasAdjusted = true;
    } else if (classification === 'mistake') {
      classification = 'inaccuracy';
      wasAdjusted = true;
    } else if (classification === 'inaccuracy') {
      classification = 'good';
      wasAdjusted = true;
    }
  }

  const result: ClassificationResult = {
    classification,
    cpLoss,
    isForced,
    isBrilliant,
    wasAdjusted,
    statusBefore,
    statusAfter,
  };

  if (wasAdjusted) {
    result.rawClassification = rawClassification;
  }

  return result;
}

/**
 * Get NAG (Numeric Annotation Glyph) code for a classification
 *
 * @param classification - Move classification
 * @returns NAG code string (e.g., "$1")
 */
export function classificationToNag(classification: MoveClassification): string | undefined {
  switch (classification) {
    case 'excellent':
      return '$1'; // !
    case 'brilliant':
      return '$3'; // !!
    case 'inaccuracy':
      return '$6'; // ?!
    case 'mistake':
      return '$2'; // ?
    case 'blunder':
      return '$4'; // ??
    case 'forced':
      return '$8'; // □ (forced move, only move)
    case 'book':
    case 'good':
    default:
      return undefined; // No NAG for neutral/book moves
  }
}

/**
 * Calculate accuracy score for a game (chess.com style)
 *
 * @param cpLosses - Array of centipawn losses for each move
 * @returns Accuracy percentage (0-100)
 */
export function calculateAccuracy(cpLosses: number[]): number {
  if (cpLosses.length === 0) {
    return 100;
  }

  // Chess.com-style accuracy formula
  // Based on win probability difference
  // This is a simplified version

  let totalAccuracy = 0;
  for (const cpLoss of cpLosses) {
    // Convert cpLoss to accuracy contribution
    // At 0 cpLoss = 100% accuracy for that move
    // Accuracy decays exponentially with cpLoss
    const moveAccuracy = Math.max(0, 100 * Math.exp(-cpLoss / 200));
    totalAccuracy += moveAccuracy;
  }

  return Math.round((totalAccuracy / cpLosses.length) * 10) / 10;
}
