/**
 * Candidate Moves Artifact
 *
 * Immutable artifact storing classified candidate moves for a position.
 * Combines Stockfish top moves with Maia human-like predictions.
 */

import type { BaseArtifact } from './base.js';

/**
 * Source classification for candidate moves
 *
 * These sources help prioritize exploration and explanation:
 * - engine_best: Top engine choice (always explore)
 * - near_best: Within threshold of best (often explore)
 * - human_popular: High Maia probability (explain human appeal)
 * - maia_preferred: Maia's #1 pick (show human preference)
 * - attractive_but_bad: Tempting but loses (show refutation!)
 * - sacrifice: Material down but compensation (tactically interesting)
 * - scary_check: Forcing check move (must address)
 * - scary_capture: Forcing capture (must address)
 * - quiet_improvement: Subtle positional (educational)
 * - blunder: Clearly losing (show why it fails)
 */
export type CandidateSource =
  | 'engine_best'
  | 'near_best'
  | 'human_popular'
  | 'maia_preferred'
  | 'attractive_but_bad'
  | 'sacrifice'
  | 'scary_check'
  | 'scary_capture'
  | 'quiet_improvement'
  | 'blunder';

/**
 * Priority ranking for candidate sources (higher = more important to explore)
 */
export const CANDIDATE_SOURCE_PRIORITY: Record<CandidateSource, number> = {
  attractive_but_bad: 10, // Shows refutation - very educational
  sacrifice: 9, // Tactically interesting
  engine_best: 8, // Main candidate
  blunder: 7, // Show why it fails
  scary_check: 6, // Must address forcing moves
  scary_capture: 5, // Must address captures
  maia_preferred: 4, // Human-intuitive
  near_best: 3, // Good alternatives
  human_popular: 2, // Common human choice
  quiet_improvement: 1, // Subtle positional
};

/**
 * A classified candidate move
 */
export interface CandidateMove {
  /** Move in SAN notation */
  san: string;

  /** Move in UCI notation */
  uci: string;

  /** Engine evaluation (centipawns, side-to-move perspective) */
  evalCp: number;

  /** Mate in N if applicable */
  mate?: number;

  /** Principal variation preview (first few moves) */
  pvPreview: string[];

  /** All applicable source classifications */
  sources: CandidateSource[];

  /** Primary source for display (highest priority) */
  primarySource: CandidateSource;

  /** Human-readable reason for classification */
  sourceReason: string;

  /** Maia probability (0-1) if available */
  maiaProbability?: number;

  /** Material delta if this is a capture (positive = gaining, negative = losing) */
  materialDelta?: number;

  /** Is this a checking move? */
  isCheck?: boolean;

  /** Is this a capture? */
  isCapture?: boolean;

  /** Is this a pawn promotion? */
  isPromotion?: boolean;
}

/**
 * Selection metadata for candidate generation
 */
export interface CandidateSelectionMeta {
  /** Stockfish depth used */
  sfDepth: number;

  /** Stockfish multipv setting */
  sfMultipv: number;

  /** Maia model rating band (e.g., '1500') */
  maiaModel?: string;

  /** Top N moves from Maia */
  maiaTopN?: number;

  /** Minimum Maia probability threshold */
  maiaMinProb?: number;

  /** Target player rating for classification */
  targetRating: number;

  /** Threshold for "near best" (centipawns) */
  nearBestThreshold: number;

  /** Threshold for "attractive but bad" based on rating */
  attractiveBadThreshold: {
    minMaiaProb: number;
    minCpLoss: number;
  };
}

/**
 * Default selection metadata
 */
export const DEFAULT_SELECTION_META: CandidateSelectionMeta = {
  sfDepth: 18,
  sfMultipv: 5,
  maiaModel: '1500',
  maiaTopN: 5,
  maiaMinProb: 0.1,
  targetRating: 1500,
  nearBestThreshold: 50,
  attractiveBadThreshold: {
    minMaiaProb: 0.2,
    minCpLoss: 100,
  },
};

/**
 * Immutable candidate moves artifact
 */
export interface CandidateMovesArtifact extends BaseArtifact {
  readonly kind: 'candidates';

  /** Classified candidate moves */
  readonly candidates: CandidateMove[];

  /** Selection parameters used */
  readonly selectionMeta: CandidateSelectionMeta;

  /** Best move according to engine */
  readonly bestMove: string;

  /** Best evaluation */
  readonly bestEval: number;

  /** Number of legal moves in position */
  readonly legalMoveCount: number;
}

/**
 * Create a candidate moves artifact
 */
export function createCandidateMovesArtifact(
  positionKey: string,
  candidates: CandidateMove[],
  selectionMeta: CandidateSelectionMeta,
  legalMoveCount: number,
): CandidateMovesArtifact {
  // Sort by eval to get best move
  const sorted = [...candidates].sort((a, b) => b.evalCp - a.evalCp);
  const best = sorted[0];

  return {
    kind: 'candidates',
    positionKey,
    createdAt: new Date().toISOString(),
    schemaVersion: 1,
    candidates,
    selectionMeta,
    bestMove: best?.san ?? '',
    bestEval: best?.evalCp ?? 0,
    legalMoveCount,
  };
}

/**
 * Determine the primary source for a candidate
 */
export function determinePrimarySource(sources: CandidateSource[]): CandidateSource {
  if (sources.length === 0) return 'near_best';

  let best: CandidateSource = sources[0]!;
  let bestPriority = CANDIDATE_SOURCE_PRIORITY[best];

  for (const source of sources) {
    const priority = CANDIDATE_SOURCE_PRIORITY[source];
    if (priority > bestPriority) {
      best = source;
      bestPriority = priority;
    }
  }

  return best;
}

/**
 * Classify a move based on engine and Maia analysis
 */
export function classifyCandidate(
  _san: string,
  _uci: string,
  evalCp: number,
  bestEval: number,
  options: {
    maiaProbability?: number;
    isCheck?: boolean;
    isCapture?: boolean;
    materialDelta?: number;
    targetRating: number;
    nearBestThreshold: number;
    attractiveBadThreshold: { minMaiaProb: number; minCpLoss: number };
  },
): { sources: CandidateSource[]; reason: string } {
  const sources: CandidateSource[] = [];
  const reasons: string[] = [];

  const cpLoss = bestEval - evalCp;
  const isNearBest = cpLoss <= options.nearBestThreshold;
  const isBest = cpLoss === 0;

  // Engine best
  if (isBest) {
    sources.push('engine_best');
    reasons.push('best engine move');
  } else if (isNearBest) {
    sources.push('near_best');
    reasons.push('close to best');
  }

  // Maia-based classifications
  if (options.maiaProbability !== undefined) {
    const { minMaiaProb, minCpLoss } = options.attractiveBadThreshold;

    if (options.maiaProbability >= 0.3) {
      sources.push('human_popular');
      reasons.push('popular human choice');
    }

    // Attractive but bad: high Maia prob but loses
    if (options.maiaProbability >= minMaiaProb && cpLoss >= minCpLoss) {
      sources.push('attractive_but_bad');
      reasons.push('tempting but loses');
    }
  }

  // Tactical classifications
  if (options.isCheck) {
    sources.push('scary_check');
    reasons.push('gives check');
  }

  if (options.isCapture) {
    sources.push('scary_capture');
    reasons.push('captures piece');
  }

  // Sacrifice detection
  if (options.materialDelta !== undefined && options.materialDelta < -100 && cpLoss <= 200) {
    sources.push('sacrifice');
    reasons.push('material sacrifice with compensation');
  }

  // Blunder detection
  if (cpLoss >= 300) {
    sources.push('blunder');
    reasons.push('loses significant material');
  }

  // Quiet improvement
  if (sources.length === 0 || (sources.length === 1 && sources.includes('near_best'))) {
    if (!options.isCheck && !options.isCapture && isNearBest) {
      sources.push('quiet_improvement');
      reasons.push('subtle positional move');
    }
  }

  // Ensure at least one source
  if (sources.length === 0) {
    sources.push('near_best');
    reasons.push('alternative move');
  }

  return {
    sources,
    reason: reasons.join(', '),
  };
}

/**
 * Create a candidate move with classification
 */
export function createCandidateMove(
  san: string,
  uci: string,
  evalCp: number,
  bestEval: number,
  pvPreview: string[],
  options: {
    maiaProbability?: number;
    mate?: number;
    isCheck?: boolean;
    isCapture?: boolean;
    isPromotion?: boolean;
    materialDelta?: number;
    targetRating: number;
    nearBestThreshold: number;
    attractiveBadThreshold: { minMaiaProb: number; minCpLoss: number };
  },
): CandidateMove {
  const { sources, reason } = classifyCandidate(san, uci, evalCp, bestEval, options);

  const candidate: CandidateMove = {
    san,
    uci,
    evalCp,
    pvPreview,
    sources,
    primarySource: determinePrimarySource(sources),
    sourceReason: reason,
  };

  if (options.mate !== undefined) {
    (candidate as { mate: number }).mate = options.mate;
  }
  if (options.maiaProbability !== undefined) {
    (candidate as { maiaProbability: number }).maiaProbability = options.maiaProbability;
  }
  if (options.materialDelta !== undefined) {
    (candidate as { materialDelta: number }).materialDelta = options.materialDelta;
  }
  if (options.isCheck !== undefined) {
    (candidate as { isCheck: boolean }).isCheck = options.isCheck;
  }
  if (options.isCapture !== undefined) {
    (candidate as { isCapture: boolean }).isCapture = options.isCapture;
  }
  if (options.isPromotion !== undefined) {
    (candidate as { isPromotion: boolean }).isPromotion = options.isPromotion;
  }

  return candidate;
}

/**
 * Filter candidates by source
 */
export function filterCandidatesBySource(
  candidates: CandidateMove[],
  sources: CandidateSource[],
): CandidateMove[] {
  return candidates.filter((c) => c.sources.some((s) => sources.includes(s)));
}

/**
 * Sort candidates by priority (most interesting first)
 */
export function sortCandidatesByPriority(candidates: CandidateMove[]): CandidateMove[] {
  return [...candidates].sort((a, b) => {
    const aPriority = CANDIDATE_SOURCE_PRIORITY[a.primarySource];
    const bPriority = CANDIDATE_SOURCE_PRIORITY[b.primarySource];
    if (aPriority !== bPriority) return bPriority - aPriority;
    return b.evalCp - a.evalCp;
  });
}
