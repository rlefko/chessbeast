/**
 * Annotation Strategy Interface
 *
 * Defines the contract for move annotation strategies. Different strategies
 * can classify moves using different approaches (e.g., cp thresholds vs win probability).
 */

import type { MoveClassification } from '../index.js';
import type { EngineEvaluation } from '../types/analysis.js';

/**
 * Context provided to an annotation strategy for classifying a move
 */
export interface AnnotationContext {
  /** Evaluation before the move (from moving player's perspective) */
  evalBefore: EngineEvaluation;
  /** Evaluation after the move (from opponent's perspective) */
  evalAfter: EngineEvaluation;
  /** FEN before the move (optional, for sacrifice detection) */
  fenBefore?: string | undefined;
  /** FEN after the move (optional, for sacrifice detection) */
  fenAfter?: string | undefined;
  /** Whether white made this move */
  isWhiteMove: boolean;
  /** Human probability of playing this move (from Maia, 0-1) */
  humanProbability?: number | undefined;
  /** Number of legal moves in the position */
  legalMoveCount?: number | undefined;
  /** Is this an opening book move? */
  isBookMove?: boolean | undefined;
  /** Is this a sacrifice? If provided, overrides FEN-based detection */
  isSacrifice?: boolean | undefined;
}

/**
 * Metadata about the annotation classification
 */
export interface AnnotationMetadata {
  /** Centipawn loss (0 or positive) */
  cpLoss: number;
  /** Win probability before the move (0-100) */
  winProbBefore: number;
  /** Win probability after the move (0-100) */
  winProbAfter: number;
  /** Win probability drop (positive = lost win chance) */
  winProbDrop: number;
  /** Whether this move is a material sacrifice */
  isSacrifice: boolean;
  /** Material lost in centipawns (if sacrifice) */
  materialLost?: number;
  /** Whether the sacrifice is sound (maintains acceptable position) */
  isSound?: boolean;
  /** Move accuracy score (0-100) if calculated */
  accuracy?: number;
}

/**
 * Result of move annotation
 */
export interface AnnotationResult {
  /** The move classification */
  classification: MoveClassification;
  /** NAG to apply (e.g., '$4' for blunder) or undefined for no NAG */
  nag?: string | undefined;
  /** Whether this annotation was auto-assigned (vs manually set) */
  isAutoAssigned: boolean;
  /** Detailed metadata about the classification */
  metadata: AnnotationMetadata;
}

/**
 * Strategy interface for move annotation
 *
 * Implementations can use different approaches:
 * - CpLossAnnotationStrategy: Rating-dependent cp thresholds (legacy)
 * - WinProbabilityAnnotationStrategy: Win probability drop (en-croissant style)
 */
export interface AnnotationStrategy {
  /** Strategy name for identification */
  readonly name: string;

  /**
   * Annotate a move based on the provided context
   *
   * @param context - Information about the move and position
   * @returns Annotation result with classification, NAG, and metadata
   */
  annotate(context: AnnotationContext): AnnotationResult;
}
