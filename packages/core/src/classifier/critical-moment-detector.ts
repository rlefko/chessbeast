/**
 * Critical Moment Detection
 *
 * Identifies the most interesting and instructive positions in a game
 * for deeper analysis and annotation.
 */

import type { MoveClassification } from '../index.js';
import type {
  CriticalMoment,
  CriticalMomentType,
  EngineEvaluation,
  GamePhase,
  NormalizedEval,
} from '../types/analysis.js';

import { normalizeEval } from './move-classifier.js';
import { CRITICAL_MOMENT_THRESHOLDS } from './thresholds.js';

/**
 * Evaluation data for a single ply
 */
export interface PlyEvaluation {
  /** Ply index (0-based) */
  plyIndex: number;
  /** Move number (1-based) */
  moveNumber: number;
  /** Is this a white move? */
  isWhiteMove: boolean;
  /** Engine evaluation before the move */
  evalBefore: EngineEvaluation;
  /** Engine evaluation after the move */
  evalAfter: EngineEvaluation;
  /** Move classification */
  classification: MoveClassification;
  /** Centipawn loss */
  cpLoss: number;
}

/**
 * Options for critical moment detection
 */
export interface CriticalMomentOptions {
  /** Maximum ratio of moves to mark as critical (default 0.25) */
  maxCriticalRatio?: number;
  /** Minimum interestingness score to include (default 30) */
  minScore?: number;
  /** Include phase transitions as critical moments */
  includePhaseTransitions?: boolean;
}

/**
 * Determine the game phase based on material and piece activity
 *
 * This is a simplified heuristic based on move number.
 * A more sophisticated version would analyze the actual position.
 *
 * @param plyIndex - Current ply index
 * @param totalPlies - Total plies in the game
 * @returns Estimated game phase
 */
export function estimateGamePhase(plyIndex: number, totalPlies: number): GamePhase {
  const percentComplete = plyIndex / Math.max(totalPlies, 1);

  // Opening: first ~15 moves (30 plies) or first 20% of game
  if (plyIndex < 30 || percentComplete < 0.2) {
    return 'opening';
  }

  // Endgame: after move 40+ or last 30% of game
  if (plyIndex >= 80 || percentComplete > 0.7) {
    return 'endgame';
  }

  return 'middlegame';
}

/**
 * Determine the expected game result based on evaluation
 *
 * @param eval_ - Normalized evaluation
 * @returns Expected result: 'white', 'black', or 'draw'
 */
function getExpectedResult(
  eval_: NormalizedEval,
  isWhiteToMove: boolean,
): 'white' | 'black' | 'draw' {
  const { cp, isMate } = eval_;

  if (isMate) {
    // Positive normalized eval = side to move mates
    const sideMating = cp > 0;
    if (isWhiteToMove) {
      return sideMating ? 'white' : 'black';
    } else {
      return sideMating ? 'black' : 'white';
    }
  }

  const { winningThreshold, clearlyWinning } = CRITICAL_MOMENT_THRESHOLDS;

  // From white's perspective
  const whiteEval = isWhiteToMove ? cp : -cp;

  if (whiteEval >= clearlyWinning) return 'white';
  if (whiteEval <= -clearlyWinning) return 'black';
  if (Math.abs(whiteEval) < winningThreshold) return 'draw';

  // Between winning threshold and clearly winning
  return whiteEval > 0 ? 'white' : 'black';
}

/**
 * Calculate interestingness score for a position
 *
 * Higher scores indicate more important positions for annotation.
 *
 * @param ply - Evaluation data for the ply
 * @param prevPly - Previous ply data (if any)
 * @param gamePhase - Current game phase
 * @returns Interestingness score (0-100)
 */
function calculateInterestingness(
  ply: PlyEvaluation,
  _prevPly?: PlyEvaluation,
  _gamePhase?: GamePhase,
): { score: number; type: CriticalMomentType; reason: string } {
  const { evalBefore, evalAfter, classification, cpLoss, isWhiteMove } = ply;
  const thresholds = CRITICAL_MOMENT_THRESHOLDS;

  // Normalize evaluations
  const normBefore = normalizeEval(evalBefore, isWhiteMove);
  const normAfter = normalizeEval(evalAfter, !isWhiteMove);
  const evalSwing = Math.abs(normBefore.cp - -normAfter.cp);

  // Check for various critical moment types

  // 1. Blunders are always interesting
  if (classification === 'blunder') {
    return {
      score: 85 + Math.min(15, cpLoss / 50),
      type: 'eval_swing',
      reason: `Blunder losing ${cpLoss} centipawns`,
    };
  }

  // 2. Brilliant moves are interesting
  if (classification === 'brilliant') {
    return {
      score: 90,
      type: 'tactical_moment',
      reason: 'Brilliant move - surprising and strong',
    };
  }

  // 3. Large evaluation swings (turning points)
  if (evalSwing >= thresholds.veryLargeEvalSwing) {
    const expectedBefore = getExpectedResult(normBefore, isWhiteMove);
    const flippedAfter: NormalizedEval = { cp: -normAfter.cp, isMate: normAfter.isMate };
    if (normAfter.mateIn !== undefined) {
      flippedAfter.mateIn = normAfter.mateIn;
    }
    const expectedAfter = getExpectedResult(flippedAfter, isWhiteMove);

    if (expectedBefore !== expectedAfter) {
      return {
        score: 80 + Math.min(15, evalSwing / 100),
        type: 'result_change',
        reason: `Game result changed from ${expectedBefore} to ${expectedAfter}`,
      };
    }

    return {
      score: 70 + Math.min(20, evalSwing / 50),
      type: 'turning_point',
      reason: `Major evaluation swing of ${evalSwing} centipawns`,
    };
  }

  // 4. Mistakes
  if (classification === 'mistake') {
    return {
      score: 60 + Math.min(20, cpLoss / 20),
      type: 'eval_swing',
      reason: `Mistake losing ${cpLoss} centipawns`,
    };
  }

  // 5. Medium evaluation swings
  if (evalSwing >= thresholds.largeEvalSwing) {
    return {
      score: 50 + Math.min(25, evalSwing / 20),
      type: 'eval_swing',
      reason: `Significant evaluation change of ${evalSwing} centipawns`,
    };
  }

  // 6. Missed wins (evaluation went from winning to not winning)
  if (normBefore.cp >= thresholds.clearlyWinning && -normAfter.cp < thresholds.winningThreshold) {
    return {
      score: 75,
      type: 'missed_win',
      reason: 'Winning advantage squandered',
    };
  }

  // 7. Tactical moments (mate threats appearing or disappearing)
  if (
    (evalBefore.mate !== undefined && evalAfter.mate === undefined) ||
    (evalBefore.mate === undefined && evalAfter.mate !== undefined)
  ) {
    return {
      score: 65,
      type: 'tactical_moment',
      reason: evalAfter.mate !== undefined ? 'Mate threat created' : 'Mate threat escaped',
    };
  }

  // 8. Inaccuracies (less critical but still notable)
  if (classification === 'inaccuracy') {
    return {
      score: 35 + Math.min(15, cpLoss / 10),
      type: 'eval_swing',
      reason: `Inaccuracy losing ${cpLoss} centipawns`,
    };
  }

  // 9. Small evaluation swings
  if (evalSwing >= thresholds.minEvalSwing) {
    return {
      score: 30 + Math.min(15, evalSwing / 15),
      type: 'eval_swing',
      reason: `Evaluation changed by ${evalSwing} centipawns`,
    };
  }

  // Default: not very interesting
  return {
    score: Math.min(25, evalSwing / 5),
    type: 'eval_swing',
    reason: 'Minor position change',
  };
}

/**
 * Detect phase transitions in the game
 *
 * @param evaluations - All ply evaluations
 * @returns Array of phase transition moments
 */
export function detectPhaseTransitions(
  evaluations: PlyEvaluation[],
): Array<{ plyIndex: number; phase: GamePhase }> {
  const transitions: Array<{ plyIndex: number; phase: GamePhase }> = [];
  const totalPlies = evaluations.length;

  let currentPhase: GamePhase = 'opening';
  for (const ply of evaluations) {
    const newPhase = estimateGamePhase(ply.plyIndex, totalPlies);
    if (newPhase !== currentPhase) {
      transitions.push({ plyIndex: ply.plyIndex, phase: newPhase });
      currentPhase = newPhase;
    }
  }

  return transitions;
}

/**
 * Detect critical moments in a game
 *
 * @param evaluations - Evaluation data for all plies
 * @param options - Detection options
 * @returns Array of critical moments, sorted by interestingness
 */
export function detectCriticalMoments(
  evaluations: PlyEvaluation[],
  options: CriticalMomentOptions = {},
): CriticalMoment[] {
  const {
    maxCriticalRatio = CRITICAL_MOMENT_THRESHOLDS.maxCriticalRatio,
    minScore = CRITICAL_MOMENT_THRESHOLDS.minInterestingnessScore,
    includePhaseTransitions = false,
  } = options;

  const totalPlies = evaluations.length;
  const moments: CriticalMoment[] = [];

  // Phase transitions
  const phaseTransitions = detectPhaseTransitions(evaluations);
  const phaseTransitionPlies = new Set(phaseTransitions.map((t) => t.plyIndex));

  // Analyze each ply
  for (let i = 0; i < evaluations.length; i++) {
    const ply = evaluations[i]!;
    const prevPly = i > 0 ? evaluations[i - 1] : undefined;
    const gamePhase = estimateGamePhase(ply.plyIndex, totalPlies);

    const { score, type, reason } = calculateInterestingness(ply, prevPly, gamePhase);

    if (score >= minScore) {
      moments.push({
        plyIndex: ply.plyIndex,
        type,
        score,
        reason,
      });
    }

    // Add phase transitions if requested
    if (includePhaseTransitions && phaseTransitionPlies.has(ply.plyIndex)) {
      const transition = phaseTransitions.find((t) => t.plyIndex === ply.plyIndex);
      if (transition) {
        moments.push({
          plyIndex: ply.plyIndex,
          type: 'phase_transition',
          score: 40, // Moderate interestingness
          reason: `Game entered ${transition.phase}`,
        });
      }
    }
  }

  // Sort by score (highest first)
  moments.sort((a, b) => b.score - a.score);

  // Apply maximum ratio cap
  const maxCritical = Math.ceil(totalPlies * maxCriticalRatio);
  const cappedMoments = moments.slice(0, maxCritical);

  // Re-sort by ply index for chronological order
  cappedMoments.sort((a, b) => a.plyIndex - b.plyIndex);

  // Remove duplicate ply indices (keep highest scored)
  const uniqueMoments: CriticalMoment[] = [];
  const seenPlies = new Set<number>();

  // First pass: highest scored moments get priority
  const sortedByScore = [...cappedMoments].sort((a, b) => b.score - a.score);
  for (const moment of sortedByScore) {
    if (!seenPlies.has(moment.plyIndex)) {
      seenPlies.add(moment.plyIndex);
      uniqueMoments.push(moment);
    }
  }

  // Re-sort chronologically
  uniqueMoments.sort((a, b) => a.plyIndex - b.plyIndex);

  return uniqueMoments;
}
