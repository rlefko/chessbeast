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
