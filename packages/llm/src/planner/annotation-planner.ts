/**
 * Annotation planner - determines what positions to annotate and how
 */

import type { GameAnalysis, MoveAnalysis, CriticalMoment } from '@chessbeast/core';

import type { TokenBudget } from '../config/llm-config.js';
import type {
  VerbosityLevel,
  CommentContext,
  AnnotationPerspective,
  PlannedVariation,
} from '../prompts/templates.js';

import { estimateTokens, shouldAnnotate } from './verbosity.js';

/**
 * Planned annotation for a single position
 */
export interface PlannedAnnotation {
  /** Position index in the game */
  plyIndex: number;
  /** The move analysis */
  move: MoveAnalysis;
  /** Critical moment info if applicable */
  criticalMoment: CriticalMoment | undefined;
  /** Calculated verbosity level */
  verbosity: VerbosityLevel;
  /** Estimated tokens for this annotation */
  estimatedTokens: number;
  /** Priority score (higher = more important) */
  priority: number;
}

/**
 * Complete annotation plan for a game
 */
export interface AnnotationPlan {
  /** Positions to annotate, sorted by priority */
  positions: PlannedAnnotation[];
  /** Whether to generate a game summary */
  generateSummary: boolean;
  /** Total estimated tokens for the plan */
  estimatedTokens: number;
  /** Target rating for explanations */
  targetRating: number;
  /** Opening name if available */
  openingName: string | undefined;
}

/**
 * Options for creating an annotation plan
 */
export interface PlanOptions {
  /** User-preferred verbosity level (default: 'normal') */
  preferredVerbosity?: VerbosityLevel;
  /** Maximum positions to annotate (default: no limit) */
  maxPositions?: number;
  /** Minimum priority score to include (default: 0) */
  minPriority?: number;
  /** Whether to skip non-critical positions when budget is tight (default: true) */
  adaptiveBudget?: boolean;
  /** Annotation perspective (default: 'neutral') */
  perspective?: AnnotationPerspective;
  /** Whether NAGs will be included in output (for NAG-aware prompts) (default: true) */
  includeNags?: boolean;
}

/**
 * Create an annotation plan for a game
 */
export function createAnnotationPlan(
  analysis: GameAnalysis,
  budget: TokenBudget,
  options: PlanOptions = {},
): AnnotationPlan {
  const {
    preferredVerbosity = 'normal',
    maxPositions,
    minPriority = 0,
    adaptiveBudget = true,
  } = options;

  // Determine target rating from game metadata
  const targetRating = getTargetRating(analysis);

  // Build a map of critical moments by ply index
  const criticalMap = new Map<number, CriticalMoment>();
  for (const moment of analysis.criticalMoments) {
    criticalMap.set(moment.plyIndex, moment);
  }

  // Identify positions to annotate and calculate priorities
  const candidates: PlannedAnnotation[] = [];

  for (const move of analysis.moves) {
    const criticalMoment = criticalMap.get(move.plyIndex);
    const isCritical = criticalMoment !== undefined;

    if (shouldAnnotate(move.classification, isCritical, move.humanProbability)) {
      const priority = calculatePriority(move, criticalMoment);

      if (priority >= minPriority) {
        candidates.push({
          plyIndex: move.plyIndex,
          move,
          criticalMoment,
          verbosity: preferredVerbosity, // Will be adjusted later
          estimatedTokens: 0, // Will be calculated later
          priority,
        });
      }
    }
  }

  // Sort by priority (highest first)
  candidates.sort((a, b) => b.priority - a.priority);

  // Apply max positions limit if specified
  let positions = maxPositions ? candidates.slice(0, maxPositions) : candidates;

  // Calculate available budget
  const summaryBudget = budget.maxTokensPerSummary;
  const availableBudget = budget.maxTokensPerGame * (1 - budget.reserveForFallback) - summaryBudget;

  // Assign verbosity levels based on budget
  if (adaptiveBudget) {
    positions = assignVerbosityLevels(positions, availableBudget, preferredVerbosity);
  } else {
    // Use preferred verbosity for all
    for (const pos of positions) {
      const isCritical = pos.criticalMoment !== undefined;
      pos.verbosity = preferredVerbosity;
      pos.estimatedTokens = estimateTokens(preferredVerbosity, isCritical);
    }
  }

  // Calculate total estimated tokens
  const positionTokens = positions.reduce((sum, p) => sum + p.estimatedTokens, 0);
  const estimatedTokens = positionTokens + summaryBudget;

  // Sort back to game order for processing
  positions.sort((a, b) => a.plyIndex - b.plyIndex);

  return {
    positions,
    generateSummary: true,
    estimatedTokens,
    targetRating,
    openingName: analysis.metadata.openingName,
  };
}

/**
 * Get target rating for explanations
 */
function getTargetRating(analysis: GameAnalysis): number {
  const { whiteElo, blackElo, estimatedWhiteElo, estimatedBlackElo } = analysis.metadata;

  // Use actual ratings if available
  if (whiteElo && blackElo) {
    return Math.round((whiteElo + blackElo) / 2);
  }

  // Fall back to estimated ratings
  if (estimatedWhiteElo && estimatedBlackElo) {
    return Math.round((estimatedWhiteElo + estimatedBlackElo) / 2);
  }

  // Default to intermediate level
  return 1500;
}

/**
 * Analysis depth based on error severity and position context
 */
export type AnalysisDepth = 'full' | 'brief' | 'minimal';

/**
 * Get subjective position assessment from centipawn value
 * Used to detect when evaluation crosses meaningful thresholds
 */
function getSubjectiveAssessment(cp: number): string {
  const absCp = Math.abs(cp);
  const side = cp >= 0 ? 'white' : 'black';

  if (absCp < 30) return 'equal';
  if (absCp < 100) return `${side}_slight`;
  if (absCp < 200) return `${side}_advantage`;
  if (absCp < 400) return `${side}_winning`;
  return `${side}_decisive`;
}

/**
 * Determine analysis depth based on error severity and position context
 *
 * Key principles:
 * - Blunders/mistakes: Full analysis - explain why wrong, show refutation
 * - Inaccuracies in losing positions: Minimal if eval doesn't change subjectively
 * - Inaccuracies that swing eval: Full analysis if crosses threshold
 * - Opening inaccuracies: Full analysis due to butterfly effect (small errors compound)
 */
export function getAnalysisDepth(
  classification: string,
  evalBefore: number,
  evalAfter: number,
  plyIndex: number,
): AnalysisDepth {
  const isOpening = plyIndex < 20; // Roughly first 10 moves

  // Blunders/mistakes always get full analysis
  if (classification === 'blunder' || classification === 'mistake') {
    return 'full';
  }

  // Inaccuracies depend on context
  if (classification === 'inaccuracy') {
    const wasLosing = evalBefore < -200;
    const stillLosing = evalAfter < -200;
    const wasWinning = evalBefore > 200;
    const stillWinning = evalAfter > 200;

    const subjBefore = getSubjectiveAssessment(evalBefore);
    const subjAfter = getSubjectiveAssessment(evalAfter);
    const subjEvalChanged = subjBefore !== subjAfter;

    // In losing/winning position with no subjective change: minimal
    // "Slightly speeds up the loss" or "Still winning" doesn't need explanation
    if (
      (wasLosing && stillLosing && !subjEvalChanged) ||
      (wasWinning && stillWinning && !subjEvalChanged)
    ) {
      return 'minimal';
    }

    // Subjective change (e.g., losing → lost, equal → slight): full analysis
    if (subjEvalChanged) {
      return 'full';
    }

    // Opening inaccuracies get full analysis due to butterfly effect
    // A 20cp loss in move 5 compounds more than a 20cp loss in move 30
    if (isOpening) {
      return 'full';
    }

    return 'brief';
  }

  return 'minimal';
}

/**
 * Calculate priority score for a position
 */
function calculatePriority(move: MoveAnalysis, criticalMoment?: CriticalMoment): number {
  let priority = 0;

  // Critical moment score (0-100)
  if (criticalMoment) {
    priority += criticalMoment.score;
  }

  // Get analysis depth to adjust priority
  const evalBefore = move.evalBefore?.cp ?? 0;
  const evalAfter = move.evalAfter?.cp ?? 0;
  const analysisDepth = getAnalysisDepth(move.classification, evalBefore, evalAfter, move.plyIndex);

  // Classification bonus (adjusted by analysis depth)
  const classificationBonus: Record<string, number> = {
    blunder: 80,
    mistake: 50,
    brilliant: 70,
    excellent: 30,
    inaccuracy: 20,
    good: 5,
    book: 0,
    forced: 10,
  };
  let classBonus = classificationBonus[move.classification] ?? 0;

  // Reduce priority for minimal-depth inaccuracies (already losing/winning)
  if (move.classification === 'inaccuracy' && analysisDepth === 'minimal') {
    classBonus = 5; // Treat like a "good" move - low priority
  }

  priority += classBonus;

  // Centipawn loss bonus (higher loss = more interesting)
  if (move.cpLoss > 0) {
    priority += Math.min(move.cpLoss / 10, 30);
  }

  // Unexpected move bonus (low human probability)
  if (move.humanProbability !== undefined && move.humanProbability < 0.2) {
    priority += (1 - move.humanProbability) * 20;
  }

  return priority;
}

/**
 * Assign verbosity levels based on available budget
 */
function assignVerbosityLevels(
  positions: PlannedAnnotation[],
  availableBudget: number,
  preferredVerbosity: VerbosityLevel,
): PlannedAnnotation[] {
  // First pass: try to fit all with preferred verbosity
  let totalTokens = 0;
  for (const pos of positions) {
    const isCritical = pos.criticalMoment !== undefined;
    pos.verbosity = preferredVerbosity;
    pos.estimatedTokens = estimateTokens(preferredVerbosity, isCritical);
    totalTokens += pos.estimatedTokens;
  }

  // If within budget, we're done
  if (totalTokens <= availableBudget) {
    return positions;
  }

  // Second pass: reduce verbosity starting from lowest priority
  const result = [...positions];
  result.sort((a, b) => a.priority - b.priority); // Lowest priority first

  for (const pos of result) {
    if (totalTokens <= availableBudget) break;

    const isCritical = pos.criticalMoment !== undefined;
    const currentTokens = pos.estimatedTokens;

    // Try to reduce verbosity
    if (pos.verbosity === 'detailed') {
      pos.verbosity = 'normal';
      pos.estimatedTokens = estimateTokens('normal', isCritical);
      totalTokens -= currentTokens - pos.estimatedTokens;
    } else if (pos.verbosity === 'normal' && !isCritical) {
      pos.verbosity = 'brief';
      pos.estimatedTokens = estimateTokens('brief', isCritical);
      totalTokens -= currentTokens - pos.estimatedTokens;
    }
  }

  // Third pass: if still over budget, remove low-priority non-critical positions
  if (totalTokens > availableBudget) {
    return result.filter((pos) => {
      if (pos.criticalMoment) return true; // Keep critical moments
      if (pos.priority >= 50) return true; // Keep high-priority
      totalTokens -= pos.estimatedTokens;
      return totalTokens > availableBudget ? false : true;
    });
  }

  return result;
}

/**
 * Classifications that result in a NAG glyph
 */
const CLASSIFICATIONS_WITH_NAG = ['blunder', 'mistake', 'inaccuracy', 'brilliant', 'excellent'];

/**
 * Check if a move classification will have a NAG glyph
 */
function classificationHasNag(classification: string): boolean {
  return CLASSIFICATIONS_WITH_NAG.includes(classification);
}

/**
 * Build comment context for a planned annotation
 */
export function buildCommentContext(
  planned: PlannedAnnotation,
  targetRating: number,
  legalMoves: string[],
  openingName?: string,
  perspective: AnnotationPerspective = 'neutral',
  includeNags: boolean = true,
  exploredVariations?: PlannedVariation[],
): CommentContext {
  const { move, criticalMoment } = planned;
  const moveNotation = `${move.moveNumber}${move.isWhiteMove ? '.' : '...'} ${move.san}`;

  const context: CommentContext = {
    move,
    criticalMoment,
    targetRating,
    legalMoves,
    openingName,
    moveNotation,
    perspective,
    hasNag: includeNags && classificationHasNag(move.classification),
  };

  // Only set plannedVariations if defined (exactOptionalPropertyTypes compatibility)
  if (exploredVariations) {
    context.plannedVariations = exploredVariations;
  }

  return context;
}
