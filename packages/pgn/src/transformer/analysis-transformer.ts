/**
 * Transform analyzed game data into annotated PGN format
 *
 * This module converts game analysis results (from @chessbeast/core) into
 * ParsedGame objects that can be rendered to PGN strings.
 */

import { ChessPosition } from '../chess/position.js';
import { resolveVariationLength } from '../chess/tension-resolver.js';
import type { GameMetadata, MoveInfo, ParsedGame } from '../index.js';
import { classificationToNag, evalToPositionNag, type MoveClassification } from '../nag/index.js';

/**
 * Options for transforming analysis to PGN
 */
export interface TransformOptions {
  /** Include alternative lines as variations (default: true) */
  includeVariations?: boolean;
  /** Include NAG symbols for move classifications (default: true) */
  includeNags?: boolean;
  /** Include position assessment NAGs like ⩲, ±, +- (default: true) */
  includePositionNags?: boolean;
  /** Target audience rating (affects position NAG thresholds, default: 1500) */
  targetRating?: number;
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
  includePositionNags: true,
  targetRating: 1500,
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

  // Add position assessment NAG (⩲, ±, +-, etc.) only on significant eval changes
  // This prevents cluttering every move with $10/$14/$15 etc.
  if (opts.includePositionNags && isSignificantEvalChange(move)) {
    const posNag = evalToPositionNag(move.evalAfter.cp, move.evalAfter.mate, opts.targetRating);
    if (posNag) {
      moveInfo.nags = moveInfo.nags ?? [];
      moveInfo.nags.push(posNag);
    }
  }

  // Add variations from alternatives if enabled
  if (opts.includeVariations && move.alternatives && move.alternatives.length > 0) {
    moveInfo.variations = transformAlternatives(move, opts);
  }

  return moveInfo;
}

/**
 * Determine if evaluation changed significantly enough to warrant a position NAG
 * This prevents cluttering every move with $10/$14/$15 position assessments
 */
function isSignificantEvalChange(move: MoveAnalysisInput): boolean {
  // Always mark position when mate is involved
  if (move.evalAfter.mate !== undefined || move.evalBefore.mate !== undefined) {
    return true;
  }

  // Check if evaluation changed by at least 50 centipawns
  const cpBefore = move.evalBefore.cp ?? 0;
  const cpAfter = move.evalAfter.cp ?? 0;
  const change = Math.abs(cpAfter - cpBefore);

  // Also mark when position crosses a significant threshold (e.g., from equal to winning)
  const crossedThreshold =
    (Math.abs(cpBefore) < 100 && Math.abs(cpAfter) >= 200) ||
    (Math.abs(cpBefore) < 200 && Math.abs(cpAfter) >= 400);

  return change >= 50 || crossedThreshold;
}

/**
 * Filter and sort alternatives by importance
 *
 * Only critical moments get variations, and max 2 per position.
 * Priority: best evaluation first (engine's top choices).
 */
function filterAlternatives(move: MoveAnalysisInput): AlternativeMove[] {
  if (!move.alternatives || move.alternatives.length === 0) {
    return [];
  }

  // Non-critical moves: no variations (NAG is enough)
  if (!move.isCriticalMoment) {
    return [];
  }

  // Sort by evaluation (best first)
  const sorted = [...move.alternatives].sort((a, b) => {
    // Mate is always best
    if (a.eval.mate !== undefined && b.eval.mate === undefined) return -1;
    if (b.eval.mate !== undefined && a.eval.mate === undefined) return 1;
    if (a.eval.mate !== undefined && b.eval.mate !== undefined) {
      // Positive mate (we're mating) is better than negative (getting mated)
      // Smaller positive mate is better (mate in 2 > mate in 5)
      if (a.eval.mate > 0 && b.eval.mate > 0) return a.eval.mate - b.eval.mate;
      if (a.eval.mate < 0 && b.eval.mate < 0) return b.eval.mate - a.eval.mate;
      return b.eval.mate - a.eval.mate; // Positive > negative
    }

    // Compare centipawn evaluations
    const aScore = a.eval.cp ?? 0;
    const bScore = b.eval.cp ?? 0;
    return bScore - aScore; // Higher is better
  });

  // Max 2 variations per critical moment
  return sorted.slice(0, 2);
}

/**
 * Transform alternative moves into variations
 *
 * Note: We intentionally do NOT add evaluation comments to variations.
 * Position assessment NAGs will be used instead.
 * Only critical moments get variations, max 2 per position.
 */
function transformAlternatives(
  move: MoveAnalysisInput,
  opts: Required<TransformOptions>,
): MoveInfo[][] {
  // Filter to only important alternatives
  const filteredAlternatives = filterAlternatives(move);

  if (filteredAlternatives.length === 0) {
    return [];
  }

  return filteredAlternatives.map((alt) => {
    // Create a single-move variation for each alternative
    const variationMove: MoveInfo = {
      moveNumber: move.moveNumber,
      san: alt.san,
      isWhiteMove: move.isWhiteMove,
      fenBefore: move.fenBefore,
      // We don't have fenAfter for alternatives, leave empty
      fenAfter: '',
    };

    // NOTE: We removed formatEvaluation() call here.
    // Engine evaluation numbers should NOT appear in PGN output.
    // Position assessment NAGs (⩲, ±, +-, etc.) will indicate who stands better.

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

// NOTE: formatEvaluation() function was removed.
// Engine evaluation numbers should not appear in PGN output.
// Position assessment NAGs (⩲, ±, +-, etc.) indicate who stands better instead.

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
