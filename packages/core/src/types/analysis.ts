/**
 * Analysis type definitions for ChessBeast
 *
 * This module uses Interface Segregation Principle (ISP) - large interfaces
 * are composed from smaller, focused interfaces. Consumers can depend on
 * only the interfaces they need.
 */

import type { MoveClassification } from '../index.js';

// ============================================================================
// Engine Evaluation Types
// ============================================================================

/**
 * Engine evaluation result
 *
 * Note: The Stockfish service returns evaluations from the side-to-move's perspective,
 * meaning positive values indicate the side to move is better, negative values indicate
 * they are worse.
 */
export interface EngineEvaluation {
  /** Centipawns from side-to-move's perspective (positive = side to move is better) */
  cp?: number;
  /** Mate in N moves from side-to-move's perspective (positive = delivers mate, negative = gets mated) */
  mate?: number;
  /** Search depth reached */
  depth: number;
  /** Principal variation (best line) in SAN notation */
  pv: string[];
  /** Principal variation in UCI notation (parallel array to pv) - avoids expensive re-derivation */
  pvUci?: string[];
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

// ============================================================================
// Move Analysis - Segregated Interfaces (ISP)
// ============================================================================

/**
 * Core move identification (SRP: identity only)
 */
export interface MoveIdentity {
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
}

/**
 * Engine evaluation data for a move (SRP: evaluation only)
 */
export interface MoveEvaluation {
  /** Evaluation before the move (position eval) */
  evalBefore: EngineEvaluation;
  /** Evaluation after the move (resulting position) */
  evalAfter: EngineEvaluation;
  /** Best move according to engine */
  bestMove: string;
  /** Centipawn loss (0 if best move was played) */
  cpLoss: number;
}

/**
 * Move classification data (SRP: classification only)
 */
export interface MoveClassificationData {
  /** Classification of the move quality */
  classification: MoveClassification;
  /** Whether this is a critical moment */
  isCriticalMoment: boolean;
}

/**
 * Alternative moves - optional extension for critical moments
 */
export interface MoveAlternatives {
  /** Alternative moves considered (for critical moments) */
  alternatives?: AlternativeMove[];
  /** Deep explored variations from VariationExplorer (for critical moments) */
  exploredVariations?: Array<{
    moves: string[];
    /** Inline annotations for specific moves (move index -> comment) */
    annotations?: Record<number, string>;
    purpose: 'best' | 'human_alternative' | 'refutation' | 'trap' | 'thematic';
    source: 'engine' | 'maia' | 'llm';
  }>;
}

/**
 * Human prediction data - optional extension
 */
export interface MoveHumanPrediction {
  /** Probability of this move being played by a human (from Maia) */
  humanProbability?: number;
}

/**
 * Annotation data - optional extension
 */
export interface MoveAnnotation {
  /** Generated annotation comment (filled in by LLM later) */
  comment?: string;
  /** Numeric Annotation Glyphs */
  nags?: string[];
}

/**
 * Full MoveAnalysis - composition of all segregated interfaces
 * Follows Interface Segregation Principle (ISP)
 */
export interface MoveAnalysis
  extends MoveIdentity,
    MoveEvaluation,
    MoveClassificationData,
    MoveAlternatives,
    MoveHumanPrediction,
    MoveAnnotation {}

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
  /** Associated NAG if auto-assigned (!, ?!, ?, ??, !!) */
  nag?: string;
  /** Whether this moment warrants deep exploration (negative NAGs only) */
  needsExploration?: boolean;
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

// ============================================================================
// Game Analysis - Segregated Interfaces (ISP)
// ============================================================================

/**
 * Game metadata extracted from PGN headers
 */
export interface GameMetadata {
  /** White player name */
  white: string;
  /** Black player name */
  black: string;
  /** Game result ("1-0", "0-1", "1/2-1/2") */
  result: string;
  /** Event name */
  event?: string;
  /** Date of the game */
  date?: string;
  /** ECO code */
  eco?: string;
  /** Opening name */
  openingName?: string;
  /** White player Elo (from PGN) */
  whiteElo?: number;
  /** Black player Elo (from PGN) */
  blackElo?: number;
  /** Estimated white Elo (from Maia) */
  estimatedWhiteElo?: number;
  /** Estimated black Elo (from Maia) */
  estimatedBlackElo?: number;
}

/**
 * Core game analysis results (moves + critical moments)
 */
export interface GameAnalysisResults {
  /** Analysis for each move */
  moves: MoveAnalysis[];
  /** Critical moments identified */
  criticalMoments: CriticalMoment[];
}

/**
 * Game statistics
 */
export interface GameStatistics {
  /** Summary statistics */
  stats: GameStats;
}

/**
 * Game summary - optional LLM-generated content
 */
export interface GameSummaryData {
  /** Generated game summary (filled in by LLM later) */
  summary?: string;
}

/**
 * Full GameAnalysis - composition of all segregated interfaces
 * Follows Interface Segregation Principle (ISP)
 */
export interface GameAnalysis extends GameAnalysisResults, GameStatistics, GameSummaryData {
  /** Game metadata */
  metadata: GameMetadata;
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
