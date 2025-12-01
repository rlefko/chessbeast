/**
 * Candidate Move Classification Types
 *
 * Types for classifying candidate moves by their source/nature, enabling
 * the LLM to understand WHY a move is interesting and decide how to explore it.
 */

/**
 * Source/classification of a candidate move
 *
 * A move can have multiple sources (e.g., both engine_best and scary_check).
 * The primarySource is determined by priority order for display.
 */
export type CandidateSource =
  | 'engine_best' // Top engine choice (rank 1)
  | 'near_best' // Within threshold of best (e.g., <50cp loss)
  | 'human_popular' // High Maia probability (>15% at target rating)
  | 'maia_preferred' // Maia's top choice
  | 'scary_check' // Moves that give check
  | 'scary_capture' // Capturing moves (especially high-value pieces)
  | 'sacrifice' // Material sacrifice with positional compensation
  | 'quiet_improvement' // Subtle positional moves (no check/capture)
  | 'attractive_but_bad' // High Maia prob but bad eval - KEY for showing refutations
  | 'blunder'; // Clearly losing moves (for refutation context)

/**
 * Priority order for determining primary source
 * Lower index = higher priority for pedagogical value
 */
export const CANDIDATE_SOURCE_PRIORITY: CandidateSource[] = [
  'attractive_but_bad', // Most pedagogically important - shows traps
  'sacrifice', // Tactically interesting
  'engine_best', // Main candidate
  'maia_preferred', // Human-intuitive choice
  'near_best', // Strong alternatives
  'human_popular', // What humans often play
  'scary_check', // Tactical nature
  'scary_capture', // Tactical nature
  'blunder', // For context only
  'quiet_improvement', // Default for non-tactical
];

/**
 * A candidate move with classification
 */
export interface ClassifiedCandidate {
  /** Move in SAN notation */
  move: string;
  /** Engine evaluation in centipawns (from side-to-move perspective) */
  evaluation: number;
  /** Is this a mate score? */
  isMate: boolean;
  /** Moves to mate if isMate is true */
  mateIn?: number;
  /** Principal variation preview (first 3-4 moves) */
  line: string;
  /** All source classifications that apply */
  sources: CandidateSource[];
  /** Most important source for display (highest priority) */
  primarySource: CandidateSource;
  /** Maia probability if available (0-1) */
  humanProbability?: number;
  /** Material balance change if capture/sacrifice (positive = gaining material) */
  materialDelta?: number;
  /** Brief explanation for LLM context */
  sourceReason: string;
}

/**
 * Configuration for candidate classification
 */
export interface CandidateClassificationConfig {
  /** Target rating for Maia predictions */
  targetRating: number;
  /** Centipawn threshold for "near_best" (default: 50cp) */
  nearBestThreshold: number;
  /** Maia probability threshold for "human_popular" (default: 0.15) */
  humanPopularThreshold: number;
  /** Centipawn loss threshold for "attractive_but_bad" (rating-dependent) */
  attractiveBadThreshold: number;
  /** Centipawn loss threshold for "blunder" (rating-dependent) */
  blunderThreshold: number;
}

/**
 * Rating-dependent thresholds for attractive-but-bad detection
 */
export const ATTRACTIVE_BAD_THRESHOLDS: Record<
  number,
  { minMaiaProb: number; minEvalLoss: number }
> = {
  1200: { minMaiaProb: 0.25, minEvalLoss: 150 },
  1500: { minMaiaProb: 0.2, minEvalLoss: 100 },
  1800: { minMaiaProb: 0.15, minEvalLoss: 75 },
  2000: { minMaiaProb: 0.1, minEvalLoss: 60 },
};

/**
 * Get interpolated attractive-but-bad thresholds for a given rating
 */
export function getAttractiveBadThresholds(rating: number): {
  minMaiaProb: number;
  minEvalLoss: number;
} {
  const ratings = Object.keys(ATTRACTIVE_BAD_THRESHOLDS)
    .map(Number)
    .sort((a, b) => a - b);

  if (rating <= ratings[0]!) {
    return ATTRACTIVE_BAD_THRESHOLDS[ratings[0]!]!;
  }
  if (rating >= ratings[ratings.length - 1]!) {
    return ATTRACTIVE_BAD_THRESHOLDS[ratings[ratings.length - 1]!]!;
  }

  let lower = ratings[0]!;
  let upper = ratings[ratings.length - 1]!;
  for (let i = 0; i < ratings.length - 1; i++) {
    if (rating >= ratings[i]! && rating <= ratings[i + 1]!) {
      lower = ratings[i]!;
      upper = ratings[i + 1]!;
      break;
    }
  }

  const lowerThresholds = ATTRACTIVE_BAD_THRESHOLDS[lower]!;
  const upperThresholds = ATTRACTIVE_BAD_THRESHOLDS[upper]!;
  const ratio = (rating - lower) / (upper - lower);

  return {
    minMaiaProb:
      lowerThresholds.minMaiaProb +
      ratio * (upperThresholds.minMaiaProb - lowerThresholds.minMaiaProb),
    minEvalLoss:
      lowerThresholds.minEvalLoss +
      ratio * (upperThresholds.minEvalLoss - lowerThresholds.minEvalLoss),
  };
}

/**
 * Piece values for material calculation (in centipawns)
 */
export const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

/**
 * Comment type for context-aware validation
 */
export type CommentType = 'initial' | 'variation_start' | 'variation_middle' | 'variation_end';

/**
 * Comment length limits by type
 */
export interface CommentLimits {
  soft: number;
  hard: number;
}

/**
 * Context-aware comment limits
 */
export const COMMENT_LIMITS: Record<CommentType, CommentLimits> = {
  initial: { soft: 75, hard: 150 },
  variation_start: { soft: 50, hard: 100 },
  variation_middle: { soft: 50, hard: 100 },
  variation_end: { soft: 100, hard: 150 },
};

/**
 * An alternative move worth considering for sideline exploration
 * Auto-detected after add_move to feed candidates to the LLM
 */
export interface AlternativeCandidate {
  /** Move in SAN notation */
  san: string;
  /** Engine evaluation in centipawns */
  evaluation: number;
  /** Is this a mate score? */
  isMate: boolean;
  /** Maia probability for this move (0-1), undefined if not available */
  humanProbability: number | undefined;
  /** Classification source explaining why this is interesting */
  source: CandidateSource;
  /** Brief reason for the LLM */
  reason: string;
}

/**
 * Configuration for detecting alternative candidates
 */
export interface AlternativeCandidateConfig {
  /** Target rating for Maia predictions */
  targetRating: number;
  /** Minimum Maia probability to consider (default: 0.15) */
  minMaiaProb: number;
  /** Maximum eval difference from best to include in centipawns (default: 100) */
  maxEvalDelta: number;
  /** Maximum number of alternatives to return (default: 3) */
  maxCandidates: number;
}
