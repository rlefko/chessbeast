/**
 * Transform analyzed game data into annotated PGN format
 *
 * This module converts game analysis results (from @chessbeast/core) into
 * ParsedGame objects that can be rendered to PGN strings.
 */

import { ChessPosition } from '../chess/position.js';
import { resolveVariationLength } from '../chess/tension-resolver.js';
import type { GameMetadata, MoveInfo, ParsedGame } from '../index.js';
import { classificationToNag, type MoveClassification } from '../nag/index.js';

/**
 * Options for transforming analysis to PGN
 */
export interface TransformOptions {
  /** Include alternative lines as variations (default: true) */
  includeVariations?: boolean;
  /** Include NAG symbols for move classifications (default: true) */
  includeNags?: boolean;
  /** Include game summary as header comment (default: true) */
  includeSummary?: boolean;
  /** Maximum depth for nested variations (default: 1) */
  maxVariationDepth?: number;
  /** Include analysis metadata as custom tags (default: false) */
  includeAnalysisMetadata?: boolean;
  /** Maximum moves in a variation (default: 15, uses tension resolution) */
  maxVariationMoves?: number;
  /** Use tension resolution for dynamic variation length (default: true) */
  useTensionResolution?: boolean;
}

/**
 * Engine evaluation result (compatible with @chessbeast/core EngineEvaluation)
 */
export interface EngineEvaluation {
  cp?: number;
  mate?: number;
  depth: number;
  pv: string[];
  nodes?: number;
}

/**
 * Alternative move with evaluation (compatible with @chessbeast/core AlternativeMove)
 */
export interface AlternativeMove {
  san: string;
  eval: EngineEvaluation;
  tag?: 'tactical' | 'strategic' | 'simplifying' | 'defensive' | 'aggressive';
}

/**
 * Move analysis result (compatible with @chessbeast/core MoveAnalysis)
 */
export interface MoveAnalysisInput {
  plyIndex: number;
  moveNumber: number;
  isWhiteMove: boolean;
  san: string;
  fenBefore: string;
  fenAfter: string;
  evalBefore: EngineEvaluation;
  evalAfter: EngineEvaluation;
  bestMove: string;
  cpLoss: number;
  classification: MoveClassification;
  humanProbability?: number;
  alternatives?: AlternativeMove[];
  isCriticalMoment: boolean;
  comment?: string;
}

/**
 * Game analysis metadata (compatible with @chessbeast/core GameAnalysis.metadata)
 */
export interface GameAnalysisMetadata {
  white: string;
  black: string;
  result: string;
  event?: string;
  site?: string;
  date?: string;
  round?: string;
  eco?: string;
  openingName?: string;
  whiteElo?: number;
  blackElo?: number;
  estimatedWhiteElo?: number;
  estimatedBlackElo?: number;
  timeControl?: string;
}

/**
 * Game analysis result (compatible with @chessbeast/core GameAnalysis)
 */
export interface GameAnalysisInput {
  metadata: GameAnalysisMetadata;
  moves: MoveAnalysisInput[];
  summary?: string;
}

/**
 * Analysis metadata to include in PGN (when includeAnalysisMetadata is true)
 */
export interface AnalysisMetadata {
  annotator?: string;
  analysisEngine?: string;
  analysisDepth?: number;
}

const DEFAULT_OPTIONS: Required<TransformOptions> = {
  includeVariations: true,
  includeNags: true,
  includeSummary: true,
  maxVariationDepth: 1,
  includeAnalysisMetadata: false,
  maxVariationMoves: 15,
  useTensionResolution: true,
};

/**
 * Transform a game analysis result into an annotated ParsedGame
 *
 * @param analysis - The analyzed game data
 * @param options - Transformation options
 * @param analysisMetadata - Optional metadata about the analysis itself
 * @returns A ParsedGame ready to be rendered to PGN
 */
export function transformAnalysisToGame(
  analysis: GameAnalysisInput,
  options: TransformOptions = {},
  analysisMetadata?: AnalysisMetadata,
): ParsedGame {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Transform metadata
  const metadata = transformMetadata(analysis.metadata, analysisMetadata, opts);

  // Transform moves
  const moves = analysis.moves.map((move) => transformMove(move, opts));

  // Build the game
  const game: ParsedGame = {
    metadata,
    moves,
  };

  // Add summary as game comment if enabled
  if (opts.includeSummary && analysis.summary) {
    game.gameComment = analysis.summary;
  }

  return game;
}

/**
 * Transform analysis metadata to PGN metadata
 */
function transformMetadata(
  analysisMetadata: GameAnalysisMetadata,
  _analysisMeta: AnalysisMetadata | undefined,
  _opts: Required<TransformOptions>,
): GameMetadata {
  const metadata: GameMetadata = {
    white: analysisMetadata.white,
    black: analysisMetadata.black,
    result: analysisMetadata.result,
  };

  // Copy optional fields
  if (analysisMetadata.event) metadata.event = analysisMetadata.event;
  if (analysisMetadata.site) metadata.site = analysisMetadata.site;
  if (analysisMetadata.date) metadata.date = analysisMetadata.date;
  if (analysisMetadata.round) metadata.round = analysisMetadata.round;
  if (analysisMetadata.eco) metadata.eco = analysisMetadata.eco;
  if (analysisMetadata.timeControl) metadata.timeControl = analysisMetadata.timeControl;

  // Use actual ELO if available, otherwise estimated
  if (analysisMetadata.whiteElo !== undefined) {
    metadata.whiteElo = analysisMetadata.whiteElo;
  } else if (analysisMetadata.estimatedWhiteElo !== undefined) {
    metadata.whiteElo = analysisMetadata.estimatedWhiteElo;
  }

  if (analysisMetadata.blackElo !== undefined) {
    metadata.blackElo = analysisMetadata.blackElo;
  } else if (analysisMetadata.estimatedBlackElo !== undefined) {
    metadata.blackElo = analysisMetadata.estimatedBlackElo;
  }

  // Add analysis metadata if enabled (these would be rendered as custom tags)
  // Note: GameMetadata doesn't support custom tags yet, so we skip this for now
  // This would require extending GameMetadata or the renderer

  return metadata;
}

/**
 * Transform a single move analysis to MoveInfo
 */
function transformMove(move: MoveAnalysisInput, opts: Required<TransformOptions>): MoveInfo {
  const moveInfo: MoveInfo = {
    moveNumber: move.moveNumber,
    san: move.san,
    isWhiteMove: move.isWhiteMove,
    fenBefore: move.fenBefore,
    fenAfter: move.fenAfter,
  };

  // Add comment if present
  if (move.comment) {
    moveInfo.commentAfter = move.comment;
  }

  // Add NAG based on classification if enabled
  if (opts.includeNags) {
    const nag = classificationToNag(move.classification);
    if (nag) {
      moveInfo.nags = [nag];
    }
  }

  // Add variations from alternatives if enabled
  if (opts.includeVariations && move.alternatives && move.alternatives.length > 0) {
    moveInfo.variations = transformAlternatives(move, opts);
  }

  return moveInfo;
}

/**
 * Transform alternative moves into variations
 */
function transformAlternatives(
  move: MoveAnalysisInput,
  opts: Required<TransformOptions>,
): MoveInfo[][] {
  if (!move.alternatives || move.alternatives.length === 0) {
    return [];
  }

  return move.alternatives.map((alt) => {
    // Create a single-move variation for each alternative
    const variationMove: MoveInfo = {
      moveNumber: move.moveNumber,
      san: alt.san,
      isWhiteMove: move.isWhiteMove,
      fenBefore: move.fenBefore,
      // We don't have fenAfter for alternatives, leave empty
      fenAfter: '',
    };

    // Add evaluation as comment
    const evalComment = formatEvaluation(alt.eval);
    if (evalComment) {
      variationMove.commentAfter = evalComment;
    }

    // Add the principal variation continuation if available
    const pvMoves = buildPvMoves(alt, move, opts);

    return [variationMove, ...pvMoves];
  });
}

/**
 * Build MoveInfo array from principal variation
 */
function buildPvMoves(
  alt: AlternativeMove,
  parentMove: MoveAnalysisInput,
  opts: Required<TransformOptions>,
): MoveInfo[] {
  // PV starts with the alternative move itself, so we skip the first element
  if (!alt.eval.pv || alt.eval.pv.length <= 1) {
    return [];
  }

  // Get continuation moves (excluding the first which is the alternative itself)
  const continuationMoves = alt.eval.pv.slice(1);

  // Determine how many moves to include
  let movesToInclude: number;
  if (opts.useTensionResolution) {
    // Calculate FEN after the alternative move to use as starting position
    const pos = new ChessPosition(parentMove.fenBefore);
    try {
      pos.move(alt.san);
      const fenAfterAlt = pos.fen();
      movesToInclude = resolveVariationLength(fenAfterAlt, continuationMoves, {
        maxMoves: opts.maxVariationMoves,
      });
    } catch {
      // If we can't make the move, fall back to max
      movesToInclude = Math.min(continuationMoves.length, opts.maxVariationMoves);
    }
  } else {
    movesToInclude = Math.min(continuationMoves.length, opts.maxVariationMoves);
  }

  if (movesToInclude === 0) {
    return [];
  }

  // Build move info with proper FEN tracking
  const pvMoves: MoveInfo[] = [];
  let currentMoveNumber = parentMove.moveNumber;
  let isWhiteMove = !parentMove.isWhiteMove; // Next move after the alternative

  // Track position for FEN generation
  const pos = new ChessPosition(parentMove.fenBefore);
  try {
    pos.move(alt.san); // Make the alternative move first
  } catch {
    // Can't track position, use empty FENs
  }

  for (let i = 0; i < movesToInclude; i++) {
    const san = continuationMoves[i];
    if (!san) continue;

    if (isWhiteMove) {
      currentMoveNumber++;
    }

    const fenBefore = pos.fen();
    let fenAfter = '';
    try {
      pos.move(san);
      fenAfter = pos.fen();
    } catch {
      // Invalid move in PV, stop here
      break;
    }

    pvMoves.push({
      moveNumber: currentMoveNumber,
      san,
      isWhiteMove,
      fenBefore,
      fenAfter,
    });

    isWhiteMove = !isWhiteMove;
  }

  return pvMoves;
}

/**
 * Format engine evaluation for display in comments
 */
function formatEvaluation(eval_: EngineEvaluation): string | undefined {
  if (eval_.mate !== undefined) {
    const sign = eval_.mate > 0 ? '+' : '';
    return `M${sign}${eval_.mate}`;
  }

  if (eval_.cp !== undefined) {
    const cpVal = eval_.cp / 100;
    const sign = cpVal >= 0 ? '+' : '';
    return `${sign}${cpVal.toFixed(2)}`;
  }

  return undefined;
}

/**
 * Check if the transformation resulted in any annotations
 */
export function hasAnnotations(game: ParsedGame): boolean {
  // Check game comment
  if (game.gameComment) return true;

  // Check moves for comments, NAGs, or variations
  for (const move of game.moves) {
    if (move.commentBefore || move.commentAfter) return true;
    if (move.nags && move.nags.length > 0) return true;
    if (move.variations && move.variations.length > 0) return true;
  }

  return false;
}

/**
 * Count the number of annotations in a game
 */
export function countAnnotations(game: ParsedGame): {
  comments: number;
  nags: number;
  variations: number;
} {
  let comments = 0;
  let nags = 0;
  let variations = 0;

  if (game.gameComment) comments++;

  for (const move of game.moves) {
    if (move.commentBefore) comments++;
    if (move.commentAfter) comments++;
    if (move.nags) nags += move.nags.length;
    if (move.variations) variations += move.variations.length;
  }

  return { comments, nags, variations };
}
