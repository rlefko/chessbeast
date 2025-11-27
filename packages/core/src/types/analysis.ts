/**
 * Analysis type definitions for ChessBeast
 */

import type { MoveClassification } from '../index.js';

/**
 * Engine evaluation result
 */
export interface EngineEvaluation {
  /** Centipawns from white's perspective (positive = white advantage) */
  cp?: number;
  /** Mate in N moves (positive = white mates, negative = black mates) */
  mate?: number;
  /** Search depth reached */
  depth: number;
  /** Principal variation (best line) in SAN notation */
  pv: string[];
  /** Number of nodes searched */
  nodes?: number;
}

/**
 * Normalized evaluation score (always from the perspective of the side to move)
 */
export interface NormalizedEval {
  /** Score in centipawns (positive = side to move is better) */
  cp: number;
  /** Whether this is a mate score */
  isMate: boolean;
  /** Moves to mate if isMate is true (always positive) */
  mateIn?: number;
}

/**
 * Alternative move with evaluation
 */
export interface AlternativeMove {
  /** Move in SAN notation */
  san: string;
  /** Engine evaluation after this move */
  eval: EngineEvaluation;
  /** Brief description of the move's purpose */
  tag?: 'tactical' | 'strategic' | 'simplifying' | 'defensive' | 'aggressive';
}

/**
 * Maia prediction result for a position
 */
export interface MaiaPrediction {
  /** Moves with probability of being played by a human at this rating */
  topMoves: Array<{
    san: string;
    probability: number;
  }>;
  /** Rating used for prediction */
  rating: number;
}

/**
 * Analysis result for a single move
 */
export interface MoveAnalysis {
  /** Position index in the game (0-based) */
  plyIndex: number;
  /** Move number (1-based, for display) */
  moveNumber: number;
  /** Is this a white move? */
  isWhiteMove: boolean;
  /** The move played in SAN notation */
  san: string;
  /** FEN before the move */
  fenBefore: string;
  /** FEN after the move */
  fenAfter: string;
  /** Evaluation before the move (position eval) */
  evalBefore: EngineEvaluation;
  /** Evaluation after the move (resulting position) */
  evalAfter: EngineEvaluation;
  /** Best move according to engine */
  bestMove: string;
  /** Centipawn loss (0 if best move was played) */
  cpLoss: number;
  /** Classification of the move quality */
  classification: MoveClassification;
  /** Probability of this move being played by a human (from Maia) */
  humanProbability?: number;
  /** Alternative moves considered (for critical moments) */
  alternatives?: AlternativeMove[];
  /** Whether this is a critical moment */
  isCriticalMoment: boolean;
  /** Generated annotation comment (filled in by LLM later) */
  comment?: string;
}

/**
 * Critical moment detection result
 */
export interface CriticalMoment {
  /** Position index in the game */
  plyIndex: number;
  /** Type of critical moment */
  type: CriticalMomentType;
  /** Interestingness score (0-100) */
  score: number;
  /** Reason for flagging as critical */
  reason: string;
}

/**
 * Types of critical moments
 */
export type CriticalMomentType =
  | 'eval_swing' // Large evaluation change
  | 'result_change' // Game result transitioned
  | 'missed_win' // Missed winning opportunity
  | 'missed_draw' // Missed drawing opportunity
  | 'phase_transition' // Opening → middlegame → endgame
  | 'tactical_moment' // Tactical opportunity (sacrifice, combination)
  | 'turning_point' // Advantage changed hands
  | 'time_pressure' // Move made under time pressure (if available)
  | 'blunder_recovery'; // Recovered from or exploited a blunder

/**
 * Game phase classification
 */
export type GamePhase = 'opening' | 'middlegame' | 'endgame';

/**
 * Full game analysis result
 */
export interface GameAnalysis {
  /** Game metadata */
  metadata: {
    white: string;
    black: string;
    result: string;
    event?: string;
    date?: string;
    eco?: string;
    openingName?: string;
    whiteElo?: number;
    blackElo?: number;
    estimatedWhiteElo?: number;
    estimatedBlackElo?: number;
  };
  /** Analysis for each move */
  moves: MoveAnalysis[];
  /** Critical moments identified */
  criticalMoments: CriticalMoment[];
  /** Summary statistics */
  stats: GameStats;
  /** Generated game summary (filled in by LLM later) */
  summary?: string;
}

/**
 * Statistical summary of the game
 */
export interface GameStats {
  /** Total moves */
  totalMoves: number;
  /** Total plies (half-moves) */
  totalPlies: number;
  /** White's statistics */
  white: PlayerStats;
  /** Black's statistics */
  black: PlayerStats;
  /** When the game left opening theory (ply index) */
  openingEndPly?: number;
  /** Phase transitions */
  phaseTransitions: Array<{
    toPly: number;
    phase: GamePhase;
  }>;
}

/**
 * Per-player statistics
 */
export interface PlayerStats {
  /** Average centipawn loss */
  averageCpLoss: number;
  /** Number of inaccuracies */
  inaccuracies: number;
  /** Number of mistakes */
  mistakes: number;
  /** Number of blunders */
  blunders: number;
  /** Number of excellent moves */
  excellentMoves: number;
  /** Number of brilliant moves */
  brilliantMoves: number;
  /** Accuracy percentage (like chess.com style) */
  accuracy: number;
}
