/**
 * Position Card Types
 *
 * Position Cards are rich analysis packages delivered automatically to the LLM
 * after every navigation action. They replace explicit analysis tool calls with
 * passive consumption of pre-computed data.
 *
 * Cards include:
 * - Engine candidates with source classification
 * - Evaluation and win probability
 * - Maia predictions for human-likeness
 * - Classical eval features (from SF16)
 * - Detected motifs and patterns
 * - Exploration recommendations
 * - Opening information (when applicable)
 */

import { cpToWinProbability, WIN_PROB_THRESHOLDS } from '@chessbeast/core';

/**
 * Source classification for candidate moves
 * Indicates WHY a move appears in the candidate list
 */
export type CandidateSource =
  | 'engine_best' // Engine's top choice
  | 'near_best' // Within threshold of best (e.g., 50cp)
  | 'human_popular' // High Maia probability
  | 'maia_preferred' // Maia's top choice if different from engine
  | 'attractive_but_bad' // Looks good but loses (tempting trap)
  | 'sacrifice' // Material sacrifice with compensation
  | 'scary_check' // Check that demands attention
  | 'scary_capture' // Capture that demands attention
  | 'quiet_improvement' // Quiet move that improves position
  | 'blunder'; // A move that loses significantly

/**
 * A single candidate move with analysis
 */
export interface CandidateMove {
  /** Move in SAN format */
  san: string;
  /** Primary source classification */
  source: CandidateSource;
  /** Secondary sources (e.g., engine_best + scary_check) */
  secondarySources?: CandidateSource[];
  /** Evaluation in centipawns (positive = White advantage) */
  evalCp: number;
  /** Is this a mate score? */
  isMate: boolean;
  /** Mate in N (if isMate is true) */
  mateIn?: number;
  /** Principal variation (next few moves) */
  pv: string[];
  /** Maia probability (0-1) if available */
  maiaProbability?: number;
  /** Human-readable explanation of the source */
  sourceExplanation?: string;
  /** Shallow position card with eval and classical features (optional) */
  shallowCard?: ShallowPositionCard;
}

/**
 * Classical evaluation breakdown from Stockfish 16
 */
export interface ClassicalFeatures {
  /** Material balance */
  material: { mg: number; eg: number };
  /** Mobility (piece activity) */
  mobility: { mg: number; eg: number };
  /** King safety */
  kingSafety: { mg: number; eg: number };
  /** Pawn structure quality */
  pawns: { mg: number; eg: number };
  /** Space control */
  space: { mg: number; eg: number };
  /** Threats and attacks */
  threats: { mg: number; eg: number };
  /** Passed pawn potential */
  passed: { mg: number; eg: number };
}

/**
 * Shallow position card for candidate moves
 * Contains evaluation and classical features for quick analysis
 * All evaluations are from White's perspective (positive = White advantage)
 */
export interface ShallowPositionCard {
  /** Evaluation in centipawns (positive = White advantage) */
  evalCp: number;
  /** Is this a mate score? */
  isMate: boolean;
  /** Mate in N (if isMate is true) */
  mateIn?: number;
  /** Analysis depth */
  depth: number;
  /** Classical eval features from SF16 (optional - requires SF16 service) */
  classicalFeatures?: ClassicalFeatures;
}

/**
 * Detected tactical and strategic motifs
 */
export type Motif =
  // Tactical
  | 'pin'
  | 'fork'
  | 'skewer'
  | 'discovered_attack'
  | 'double_attack'
  | 'back_rank_weakness'
  | 'overloaded_piece'
  | 'hanging_piece'
  | 'trapped_piece'
  | 'removal_of_guard'
  | 'deflection'
  | 'decoy'
  | 'zwischenzug'
  // Strategic
  | 'weak_pawn'
  | 'isolated_pawn'
  | 'doubled_pawns'
  | 'passed_pawn'
  | 'outpost'
  | 'open_file'
  | 'bishop_pair'
  | 'bad_bishop'
  | 'knight_on_rim'
  | 'king_in_center'
  | 'space_advantage'
  | 'development_lead'
  | 'piece_coordination'
  | 'piece_activity';

/**
 * Exploration recommendation
 */
export type ExplorationRecommendation = 'EXPLORE' | 'BRIEF' | 'SKIP';

/**
 * Opening information when position is in book
 */
export interface OpeningInfo {
  /** ECO code (e.g., "B12") */
  eco: string;
  /** Opening name */
  name: string;
  /** Variation name (if applicable) */
  variation?: string;
  /** Common plans or ideas */
  plans?: string[];
}

/**
 * Reference game from database
 */
export interface ReferenceGame {
  /** White player name */
  white: string;
  /** Black player name */
  black: string;
  /** Year played */
  year?: number;
  /** Result (1-0, 0-1, 1/2-1/2) */
  result: string;
  /** Event name */
  event?: string;
}

/**
 * Complete Position Card delivered after navigation
 */
export interface PositionCard {
  /** FEN of the position */
  fen: string;

  /** Side to move */
  sideToMove: 'white' | 'black';

  /** Candidate moves with sources */
  candidates: CandidateMove[];

  /** Overall evaluation */
  evaluation: {
    /** Centipawns (positive = White) */
    cp: number;
    /** Win probability for side to move (0-100) */
    winProbability: number;
    /** Is this a mate score? */
    isMate: boolean;
    /** Mate in N (if applicable) */
    mateIn?: number;
    /** Analysis depth */
    depth: number;
  };

  /** Maia prediction for the rating band */
  maiaPrediction?: {
    /** Most likely move */
    topMove: string;
    /** Probability (0-1) */
    probability: number;
    /** Target rating band */
    rating: number;
  };

  /** Classical eval features from SF16 (optional) */
  classicalFeatures?: ClassicalFeatures;

  /** Detected motifs and patterns */
  motifs: Motif[];

  /** Exploration recommendation */
  recommendation: {
    action: ExplorationRecommendation;
    reason: string;
  };

  /** Opening info (if in book) */
  opening?: OpeningInfo;

  /** Reference games (if available) */
  referenceGames?: ReferenceGame[];

  /** Depth in the variation tree */
  treeDepth: number;

  /** Is this a terminal position (checkmate/stalemate)? */
  isTerminal: boolean;

  /** Terminal reason if applicable */
  terminalReason?: 'checkmate' | 'stalemate' | 'insufficient_material' | 'draw_claim';
}

/**
 * Format a Position Card for display in a system message
 */
export function formatPositionCard(card: PositionCard): string {
  const lines: string[] = [];

  // Header with side to move
  lines.push(`[POSITION CARD - ${card.sideToMove.toUpperCase()} to move]`);
  lines.push('');

  // Terminal position handling
  if (card.isTerminal) {
    lines.push(`**TERMINAL: ${card.terminalReason}**`);
    return lines.join('\n');
  }

  // Recommendation (most important - show first)
  lines.push(`**Recommendation: ${card.recommendation.action}** - ${card.recommendation.reason}`);
  lines.push('');

  // Evaluation
  const evalSign = card.evaluation.cp >= 0 ? '+' : '';
  const evalStr = card.evaluation.isMate
    ? `M${card.evaluation.mateIn}`
    : `${evalSign}${(card.evaluation.cp / 100).toFixed(2)}`;
  lines.push(
    `Eval: ${evalStr} (${card.evaluation.winProbability}% win prob, depth ${card.evaluation.depth})`,
  );

  // Candidates
  lines.push('');
  lines.push('Candidates:');
  for (const candidate of card.candidates.slice(0, 5)) {
    const evalSign = candidate.evalCp >= 0 ? '+' : '';
    const eval_ = candidate.isMate
      ? `M${candidate.mateIn}`
      : `${evalSign}${(candidate.evalCp / 100).toFixed(2)}`;
    const maiaStr = candidate.maiaProbability
      ? ` (${(candidate.maiaProbability * 100).toFixed(0)}% human)`
      : '';
    const sources = [candidate.source, ...(candidate.secondarySources || [])].join(', ');
    lines.push(`  ${candidate.san}: ${eval_}${maiaStr} [${sources}]`);
    if (candidate.pv.length > 1) {
      lines.push(`    → ${candidate.pv.slice(1, 5).join(' ')}`);
    }
    // Show shallow card classical features if available
    if (candidate.shallowCard?.classicalFeatures) {
      const sc = candidate.shallowCard.classicalFeatures;
      const shallowFeatures: string[] = [];
      if (Math.abs(sc.mobility.mg) >= 0.2) {
        shallowFeatures.push(`mob ${sc.mobility.mg > 0 ? '+' : ''}${sc.mobility.mg.toFixed(1)}`);
      }
      if (Math.abs(sc.kingSafety.mg) >= 0.15) {
        shallowFeatures.push(
          `king ${sc.kingSafety.mg > 0 ? '+' : ''}${sc.kingSafety.mg.toFixed(1)}`,
        );
      }
      if (Math.abs(sc.space.mg) >= 0.15) {
        shallowFeatures.push(`space ${sc.space.mg > 0 ? '+' : ''}${sc.space.mg.toFixed(1)}`);
      }
      if (shallowFeatures.length > 0) {
        lines.push(`    [after: ${shallowFeatures.join(', ')}]`);
      }
    }
  }

  // Maia prediction
  if (card.maiaPrediction) {
    lines.push('');
    lines.push(
      `Maia (${card.maiaPrediction.rating}): ${card.maiaPrediction.topMove} (${(card.maiaPrediction.probability * 100).toFixed(0)}%)`,
    );
  }

  // Motifs
  if (card.motifs.length > 0) {
    lines.push('');
    lines.push(`Motifs: ${card.motifs.join(', ')}`);
  }

  // Classical features (if present)
  if (card.classicalFeatures) {
    const cf = card.classicalFeatures;
    const features: string[] = [];
    if (Math.abs(cf.mobility.mg) >= 0.3) {
      features.push(`mobility ${cf.mobility.mg > 0 ? '+' : ''}${cf.mobility.mg.toFixed(2)}`);
    }
    if (Math.abs(cf.kingSafety.mg) >= 0.2) {
      features.push(`king safety ${cf.kingSafety.mg > 0 ? '+' : ''}${cf.kingSafety.mg.toFixed(2)}`);
    }
    if (Math.abs(cf.space.mg) >= 0.2) {
      features.push(`space ${cf.space.mg > 0 ? '+' : ''}${cf.space.mg.toFixed(2)}`);
    }
    if (features.length > 0) {
      lines.push('');
      lines.push(`Classical: ${features.join(', ')}`);
    }
  }

  // Opening info
  if (card.opening) {
    lines.push('');
    lines.push(`Opening: ${card.opening.eco} ${card.opening.name}`);
    if (card.opening.variation) {
      lines.push(`  Variation: ${card.opening.variation}`);
    }
  }

  // Reference games
  if (card.referenceGames && card.referenceGames.length > 0) {
    lines.push('');
    lines.push('Reference games:');
    for (const game of card.referenceGames.slice(0, 3)) {
      const yearStr = game.year ? ` (${game.year})` : '';
      lines.push(`  ${game.white} vs ${game.black}${yearStr}: ${game.result}`);
    }
  }

  return lines.join('\n');
}

/**
 * Get quality symbol based on win probability drop from best candidate
 * Uses en-croissant style win probability thresholds
 *
 * @param evalCp - Evaluation for this move (from White's perspective)
 * @param bestEvalCp - Evaluation of the best move (from White's perspective)
 * @param sideToMove - Which side is to move
 * @returns Quality symbol (!, ?!, ?, ??, or empty string)
 */
function evalToSymbol(evalCp: number, bestEvalCp: number, sideToMove: 'white' | 'black'): string {
  // Convert evals to side-to-move perspective for correct comparison
  // (evals are stored from White's perspective, but cpToWinProbability expects
  // positive = good for the player being evaluated)
  const evalFromStm = sideToMove === 'white' ? evalCp : -evalCp;
  const bestEvalFromStm = sideToMove === 'white' ? bestEvalCp : -bestEvalCp;

  // Convert to win probabilities (now correctly from side-to-move perspective)
  const winProbThis = cpToWinProbability(evalFromStm);
  const winProbBest = cpToWinProbability(bestEvalFromStm);

  // Win probability drop (positive = lost win chance for side-to-move)
  const winProbDrop = winProbBest - winProbThis;

  // Classify based on win probability thresholds
  if (winProbDrop > WIN_PROB_THRESHOLDS.blunder) return '??'; // >20% lost
  if (winProbDrop > WIN_PROB_THRESHOLDS.mistake) return '?'; // >10% lost
  if (winProbDrop > WIN_PROB_THRESHOLDS.dubious) return '?!'; // >5% lost
  if (winProbDrop < -WIN_PROB_THRESHOLDS.good) return '!'; // >5% gained
  return ''; // Normal move
}

/**
 * Filter candidates to only include human-relevant moves.
 * Engine-only moves rated ?!, ?, or ?? (>5% win drop) are excluded
 * unless also in Maia candidates.
 *
 * @param candidates - All candidate moves
 * @param bestEval - Best evaluation (from White's perspective)
 * @param sideToMove - Which side is to move
 * @returns Filtered list of human-relevant candidates
 */
function filterHumanRelevantCandidates(
  candidates: CandidateMove[],
  bestEval: number,
  sideToMove: 'white' | 'black',
): CandidateMove[] {
  // Build set of Maia-predicted moves
  const maiaMoves = new Set(
    candidates
      .filter((c) => c.maiaProbability !== undefined && c.maiaProbability > 0)
      .map((c) => c.san),
  );

  // Convert best eval to side-to-move perspective
  const bestEvalFromStm = sideToMove === 'white' ? bestEval : -bestEval;
  const bestWinProb = cpToWinProbability(bestEvalFromStm);

  return candidates.filter((c, index) => {
    // Always include best move (first candidate)
    if (index === 0) return true;

    // Check if this move is in Maia candidates
    if (maiaMoves.has(c.san)) return true;

    // Calculate win probability drop
    const evalCp = c.shallowCard?.evalCp ?? c.evalCp;
    const evalFromStm = sideToMove === 'white' ? evalCp : -evalCp;
    const winProb = cpToWinProbability(evalFromStm);
    const winProbDrop = bestWinProb - winProb;

    // Keep moves within dubious threshold (≤5% win drop)
    return winProbDrop <= WIN_PROB_THRESHOLDS.dubious;
  });
}

/**
 * Format classical features for display
 * Shows significant features only (mobility, king safety, space)
 */
function formatClassicalFeaturesForDisplay(cf: ClassicalFeatures): string {
  const features: string[] = [];
  if (Math.abs(cf.mobility.mg) >= 0.2) {
    features.push(`mob ${cf.mobility.mg > 0 ? '+' : ''}${cf.mobility.mg.toFixed(1)}`);
  }
  if (Math.abs(cf.kingSafety.mg) >= 0.15) {
    features.push(`king ${cf.kingSafety.mg > 0 ? '+' : ''}${cf.kingSafety.mg.toFixed(1)}`);
  }
  if (Math.abs(cf.space.mg) >= 0.15) {
    features.push(`space ${cf.space.mg > 0 ? '+' : ''}${cf.space.mg.toFixed(1)}`);
  }
  return features.join(', ');
}

/**
 * Format a candidate's eval for display
 */
function formatCandidateEval(evalCp: number, isMate: boolean, mateIn?: number): string {
  if (isMate && mateIn !== undefined) {
    return `M${mateIn}`;
  }
  const sign = evalCp >= 0 ? '+' : '';
  return `${sign}${(evalCp / 100).toFixed(2)}`;
}

/**
 * Format a Position Card in concise format for debug logging
 *
 * Output format:
 * [CARD] W d=3 +1.23 (72%)
 * FEN: rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1
 *   e5! +0.12 [mob +0.3]
 *   Nf6 +0.05
 *   EXPLORE: reason | motifs: pin, outpost
 */
export function formatPositionCardConcise(card: PositionCard): string {
  const lines: string[] = [];

  // Line 1: Side, depth, eval, win prob
  const side = card.sideToMove === 'white' ? 'W' : 'B';

  if (card.isTerminal) {
    lines.push(
      `[CARD] ${side} d=${card.treeDepth} ${card.terminalReason?.toUpperCase() ?? 'TERMINAL'}`,
    );
    lines.push(`FEN: ${card.fen}`);
    return lines.join('\n');
  }

  const evalSign = card.evaluation.cp >= 0 ? '+' : '';
  const evalStr = card.evaluation.isMate
    ? `M${card.evaluation.mateIn}`
    : `${evalSign}${(card.evaluation.cp / 100).toFixed(2)}`;
  lines.push(`[CARD] ${side} d=${card.treeDepth} ${evalStr} (${card.evaluation.winProbability}%)`);

  // Line 2: FEN
  lines.push(`FEN: ${card.fen}`);

  // Filter to human-relevant candidates
  const bestEval = card.candidates[0]?.shallowCard?.evalCp ?? card.candidates[0]?.evalCp ?? 0;
  const relevantCandidates = filterHumanRelevantCandidates(
    card.candidates,
    bestEval,
    card.sideToMove,
  );

  // Lines 3-N: Candidates with eval and classical features
  for (const c of relevantCandidates.slice(0, 3)) {
    const candidateEval = c.shallowCard?.evalCp ?? c.evalCp;
    const symbol = evalToSymbol(candidateEval, bestEval, card.sideToMove);
    const evalDisplay = formatCandidateEval(candidateEval, c.isMate, c.mateIn);

    let line = `  ${c.san}${symbol} ${evalDisplay}`;

    // Add classical features if significant
    if (c.shallowCard?.classicalFeatures) {
      const features = formatClassicalFeaturesForDisplay(c.shallowCard.classicalFeatures);
      if (features) {
        line += ` [${features}]`;
      }
    }

    lines.push(line);
  }

  // Final line: Recommendation + motifs
  let lastLine = `  ${card.recommendation.action}: ${card.recommendation.reason}`;
  if (card.motifs.length > 0) {
    lastLine += ` | motifs: ${card.motifs.join(', ')}`;
  }
  lines.push(lastLine);

  return lines.join('\n');
}

/**
 * Card tier determines analysis depth and included data
 *
 * Tiers allow trading off analysis depth for speed:
 * - full: Initial position, critical moments (deepest analysis)
 * - standard: Recently explored moves (moderate analysis)
 * - shallow: Deep variations (minimal analysis)
 * - minimal: Very deep positions (eval only, for stopping heuristics)
 */
export type CardTier = 'full' | 'standard' | 'shallow' | 'minimal';

/**
 * Configuration for each card tier
 */
export interface CardTierConfig {
  /** Engine analysis depth */
  engineDepth: number;
  /** Number of principal variations to compute */
  multipv: number;
  /** Include classical evaluation features (SF16) */
  includeClassicalFeatures: boolean;
  /** Include reference games from database */
  includeReferenceGames: boolean;
  /** Include Maia predictions */
  includeMaia: boolean;
}

/**
 * Tier configurations optimized for different exploration depths
 *
 * Trade-offs:
 * - Higher tiers compute more data but take longer
 * - Lower tiers are faster but provide less context to the LLM
 */
export const CARD_TIER_CONFIGS: Record<CardTier, CardTierConfig> = {
  full: {
    engineDepth: 18,
    multipv: 4,
    includeClassicalFeatures: true,
    includeReferenceGames: true,
    includeMaia: true,
  },
  standard: {
    engineDepth: 16,
    multipv: 3,
    includeClassicalFeatures: true,
    includeReferenceGames: false,
    includeMaia: true,
  },
  shallow: {
    engineDepth: 12,
    multipv: 1,
    includeClassicalFeatures: false,
    includeReferenceGames: false,
    includeMaia: true,
  },
  minimal: {
    engineDepth: 10,
    multipv: 1,
    includeClassicalFeatures: false,
    includeReferenceGames: false,
    includeMaia: false,
  },
};

/**
 * Depth offset for shallow card analysis
 * Shallow cards use a reduced depth compared to the main card tier
 */
export const SHALLOW_DEPTH_OFFSET = 6;
