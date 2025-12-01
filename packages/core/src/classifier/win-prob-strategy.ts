/**
 * Win Probability Annotation Strategy
 *
 * Implements the AnnotationStrategy interface using win probability-based
 * classification (en-croissant style). This approach captures positional
 * context better than raw centipawn thresholds.
 */

import type { MoveClassification } from '../index.js';

import type {
  AnnotationStrategy,
  AnnotationContext,
  AnnotationResult,
  AnnotationMetadata,
} from './annotation-strategy.js';
import { getMaterialDelta } from './material.js';
import { calculateCpLoss } from './move-classifier.js';
import {
  cpToWinProbability,
  calculateWinProbDrop,
  WIN_PROB_THRESHOLDS,
  getMoveAccuracy,
} from './win-probability.js';

/**
 * Win Probability Annotation Strategy
 *
 * Classifies moves based on win probability drop:
 * - Blunder (??): >20% win chance lost
 * - Mistake (?): >10% win chance lost
 * - Dubious (?!): >5% win chance lost
 * - Brilliant (!!): surprising sacrifice maintaining advantage
 * - Good (!): >5% win chance gained
 * - Interesting (!?): sound sacrifice
 */
export class WinProbabilityAnnotationStrategy implements AnnotationStrategy {
  readonly name = 'win_probability';

  annotate(context: AnnotationContext): AnnotationResult {
    const {
      evalBefore,
      evalAfter,
      fenBefore,
      fenAfter,
      isWhiteMove,
      humanProbability,
      isBookMove,
      legalMoveCount,
    } = context;

    // Book moves are always classified as 'book' with no NAG
    if (isBookMove) {
      return this.createResult('book', undefined, {
        cpLoss: 0,
        winProbBefore: cpToWinProbability(this.getCp(evalBefore)),
        winProbAfter: cpToWinProbability(-this.getCp(evalAfter)),
        winProbDrop: 0,
        isSacrifice: false,
      });
    }

    // Calculate centipawn values
    const cpBefore = this.getCp(evalBefore);
    const cpAfter = this.getCp(evalAfter);

    // Calculate win probabilities
    const winProbBefore = cpToWinProbability(cpBefore);
    // cpAfter is from opponent's view, negate to get player's view
    const winProbAfter = cpToWinProbability(-cpAfter);
    const winProbDrop = calculateWinProbDrop(cpBefore, cpAfter);

    // Calculate cpLoss for metadata
    const cpLoss = calculateCpLoss(evalBefore, evalAfter, isWhiteMove);

    // Detect sacrifice: use explicit flag if provided, otherwise detect from FEN
    let isSacrifice = context.isSacrifice ?? false;
    let materialLost = 0;
    let isSound = false;

    // If FENs are provided, calculate material delta for additional context
    if (fenBefore && fenAfter) {
      const materialDelta = getMaterialDelta(fenBefore, fenAfter, isWhiteMove);
      materialLost = -materialDelta; // Positive if player lost material

      // Auto-detect sacrifice from FEN if not explicitly provided
      if (context.isSacrifice === undefined) {
        isSacrifice = materialLost >= WIN_PROB_THRESHOLDS.sacrificeThreshold;
      }
    }

    // Sound sacrifice = position after is still acceptable (-200cp or better)
    // cpAfter is from opponent's view, so from player's view it's -cpAfter
    // This matches en-croissant's logic: is_sacrifice && nextCP > -200
    isSound = isSacrifice && -cpAfter > WIN_PROB_THRESHOLDS.soundSacrificeMinCp;

    // Build metadata
    const metadata: AnnotationMetadata = {
      cpLoss,
      winProbBefore,
      winProbAfter,
      winProbDrop,
      isSacrifice,
      ...(isSacrifice && { materialLost }),
      ...(isSacrifice && { isSound }),
      accuracy: getMoveAccuracy(cpBefore, cpAfter),
    };

    // Check for forced move (only 1-2 legal options)
    if (legalMoveCount !== undefined && legalMoveCount <= 2) {
      return this.createResult('forced', '$8', metadata);
    }

    // Classification priority:
    // 1. Check positive annotations first (brilliant, good, interesting)
    // 2. Then check negative annotations (blunder, mistake, dubious)

    // Brilliant (!!) - surprising sacrifice that works
    if (isSacrifice && isSound && winProbDrop <= WIN_PROB_THRESHOLDS.good) {
      // Must be surprising (low human probability)
      if (humanProbability !== undefined && humanProbability < 0.15) {
        return this.createResult('brilliant', '$3', metadata);
      }
    }

    // Good (!) - gained significant win chance
    if (winProbDrop < -WIN_PROB_THRESHOLDS.good) {
      // For non-sacrifices, gaining >5% win chance is good
      // For sacrifices that are sound, it's brilliant (handled above) or interesting
      if (!isSacrifice) {
        return this.createResult('excellent', '$1', metadata);
      }
    }

    // Interesting (!?) - sound sacrifice, not necessarily best
    if (isSacrifice && isSound && winProbDrop <= WIN_PROB_THRESHOLDS.mistake) {
      return this.createResult('good', '$5', metadata);
    }

    // Blunder (??) - lost >20% win chance
    if (winProbDrop > WIN_PROB_THRESHOLDS.blunder) {
      return this.createResult('blunder', '$4', metadata);
    }

    // Mistake (?) - lost >10% win chance
    if (winProbDrop > WIN_PROB_THRESHOLDS.mistake) {
      return this.createResult('mistake', '$2', metadata);
    }

    // Dubious (?!) - lost >5% win chance
    if (winProbDrop > WIN_PROB_THRESHOLDS.dubious) {
      return this.createResult('inaccuracy', '$6', metadata);
    }

    // Normal move - no NAG
    return this.createResult('good', undefined, metadata);
  }

  /**
   * Extract centipawn value from engine evaluation
   */
  private getCp(eval_: { cp?: number; mate?: number }): number {
    if (eval_.mate !== undefined) {
      // Convert mate to cp-equivalent
      // Positive mate = delivering mate (very good)
      // Negative mate = getting mated (very bad)
      return eval_.mate > 0 ? 10000 - eval_.mate * 10 : -10000 - eval_.mate * 10;
    }
    return eval_.cp ?? 0;
  }

  /**
   * Create an AnnotationResult
   */
  private createResult(
    classification: MoveClassification,
    nag: string | undefined,
    metadata: AnnotationMetadata,
  ): AnnotationResult {
    return {
      classification,
      nag,
      isAutoAssigned: true,
      metadata,
    };
  }
}

/**
 * Singleton instance of the win probability strategy
 */
export const winProbabilityStrategy = new WinProbabilityAnnotationStrategy();
