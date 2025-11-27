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
  type ClassificationThresholds,
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
}

/**
 * Normalize an engine evaluation to be from the perspective of the side to move
 *
 * @param eval_ - Engine evaluation
 * @param isWhiteToMove - Is it white's turn?
 * @returns Normalized evaluation (positive = side to move is better)
 */
export function normalizeEval(eval_: EngineEvaluation, isWhiteToMove: boolean): NormalizedEval {
  if (eval_.mate !== undefined) {
    // Mate scores: positive = white mates, negative = black mates
    // Normalize so positive = side to move mates
    const normalizedMate = isWhiteToMove ? eval_.mate : -eval_.mate;
    return {
      cp: normalizedMate > 0 ? 100000 - normalizedMate * 100 : -100000 - normalizedMate * 100,
      isMate: true,
      mateIn: Math.abs(eval_.mate),
    };
  }

  // Centipawn: positive = white advantage
  // Normalize so positive = side to move advantage
  const cp = eval_.cp ?? 0;
  const normalizedCp = isWhiteToMove ? cp : -cp;

  return {
    cp: normalizedCp,
    isMate: false,
  };
}

/**
 * Calculate centipawn loss between two evaluations
 *
 * @param evalBefore - Evaluation of position before move
 * @param evalAfter - Evaluation of position after move
 * @param isWhiteMove - Did white make this move?
 * @returns Centipawn loss (0 or positive number)
 */
export function calculateCpLoss(
  evalBefore: EngineEvaluation,
  evalAfter: EngineEvaluation,
  isWhiteMove: boolean,
): number {
  // Normalize both from the moving player's perspective
  const normBefore = normalizeEval(evalBefore, isWhiteMove);
  const normAfter = normalizeEval(evalAfter, !isWhiteMove); // After move, it's opponent's turn

  // Flip the after eval since now we're looking at it from the original player's view
  const afterFromPlayerView = -normAfter.cp;

  // CPLoss = eval_before - eval_after (from player's perspective)
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
  const { rating = DEFAULT_RATING, isBookMove, humanProbability, isSacrifice, legalMoveCount } =
    options;

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

  return {
    classification,
    cpLoss,
    isForced,
    isBrilliant,
  };
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
