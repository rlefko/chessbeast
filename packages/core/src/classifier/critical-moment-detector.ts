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
} from '../types/analysis.js';

import { CRITICAL_MOMENT_THRESHOLDS } from './thresholds.js';
import { calculateWinProbDrop, WIN_PROB_THRESHOLDS } from './win-probability.js';

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
 * Result of interestingness calculation
 *
 * Now aligned with NAG assignment using win probability thresholds.
 * Critical moment = Any move with auto-assigned NAG.
 */
interface InterestingnessResult {
  score: number;
  type: CriticalMomentType;
  reason: string;
  /** Associated NAG symbol if auto-assigned */
  nag?: string;
}

/**
 * Calculate interestingness score for a position using win probability
 *
 * Uses win probability thresholds aligned with NAG assignment.
 * A critical moment is any move that gets automatically assigned a NAG annotation.
 *
 * Score philosophy:
 * - ?? (blunder): 95 - highest priority
 * - ? (mistake): 75
 * - ?! (dubious): 55
 * - !! (brilliant): 45
 * - ! (good move): 40 - lower priority (good moves less interesting for exploration)
 *
 * @param ply - Evaluation data for the ply
 * @returns Interestingness result with score, type, reason, and optional NAG
 */
function calculateInterestingness(ply: PlyEvaluation): InterestingnessResult {
  const { evalBefore, evalAfter, classification } = ply;

  // Convert mate scores to extreme cp values for win probability calculation
  const cpBefore =
    evalBefore.mate !== undefined ? (evalBefore.mate > 0 ? 10000 : -10000) : (evalBefore.cp ?? 0);
  const cpAfter =
    evalAfter.mate !== undefined ? (evalAfter.mate > 0 ? 10000 : -10000) : (evalAfter.cp ?? 0);

  // Calculate win probability drop from the moving player's perspective
  // evalBefore.cp is from the moving player's perspective (positive = good for mover)
  // evalAfter.cp is from the opponent's perspective (positive = good for opponent)
  // calculateWinProbDrop handles the perspective conversion internally
  const winProbDrop = calculateWinProbDrop(cpBefore, cpAfter);

  // Brilliant moves take precedence (from existing classification - typically sacrifices)
  // Check this first before win probability thresholds
  if (classification === 'brilliant') {
    return {
      score: 45,
      type: 'tactical_moment',
      reason: 'Brilliant move',
      nag: '!!',
    };
  }

  // Interesting (!?) - sound sacrifice, not necessarily best
  // Detected when: sacrifice (cpLoss >= 100) + sound position + win prob drop not catastrophic
  // Uses same perspective handling as calculateCpLoss in move-classifier.ts:
  // - evalAfter is from opponent's perspective, negate to get player's view
  const isSacrifice = ply.cpLoss >= 100;
  const playerPerspectiveAfter = -cpAfter; // Same pattern as move-classifier.ts line 128
  const isSound = playerPerspectiveAfter >= -200; // Player not worse than -200cp
  const isNotCatastrophic = winProbDrop <= WIN_PROB_THRESHOLDS.mistake;

  if (isSacrifice && isSound && isNotCatastrophic) {
    return {
      score: 42,
      type: 'tactical_moment',
      reason: `Interesting sacrifice (${ply.cpLoss}cp loss, position sound)`,
      nag: '!?',
    };
  }

  // Classify based on win probability thresholds (aligned with NAG assignment)
  if (winProbDrop > WIN_PROB_THRESHOLDS.blunder) {
    return {
      score: 95,
      type: 'eval_swing',
      reason: `Blunder (${winProbDrop.toFixed(1)}% win probability lost)`,
      nag: '??',
    };
  }

  if (winProbDrop > WIN_PROB_THRESHOLDS.mistake) {
    return {
      score: 75,
      type: 'eval_swing',
      reason: `Mistake (${winProbDrop.toFixed(1)}% win probability lost)`,
      nag: '?',
    };
  }

  if (winProbDrop > WIN_PROB_THRESHOLDS.dubious) {
    return {
      score: 55,
      type: 'eval_swing',
      reason: `Dubious move (${winProbDrop.toFixed(1)}% win probability lost)`,
      nag: '?!',
    };
  }

  // Check for good moves (gained win probability)
  if (winProbDrop < -WIN_PROB_THRESHOLDS.good) {
    return {
      score: 40, // Lower priority - good moves less interesting for exploration
      type: 'tactical_moment',
      reason: `Good move (${(-winProbDrop).toFixed(1)}% win probability gained)`,
      nag: '!',
    };
  }

  // Default: not a critical moment (no NAG assigned)
  return {
    score: 0,
    type: 'eval_swing',
    reason: 'Normal move',
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
 * A critical moment is any move that gets automatically assigned a NAG annotation.
 * Only negative NAGs (?!, ?, ??) warrant deep exploration.
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
    minScore = 1, // Any move with a NAG is critical (score > 0)
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

    const { score, type, reason, nag } = calculateInterestingness(ply);

    // Only include moves that got a NAG (score > 0)
    if (nag && score >= minScore) {
      moments.push({
        plyIndex: ply.plyIndex,
        type,
        score,
        reason,
        nag,
        // Negative NAGs need deep exploration to explain what went wrong
        // Positive NAGs (player understood the move) just need brief explanation
        needsExploration: ['??', '?', '?!'].includes(nag),
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
