/**
 * Annotation planner - determines what positions to annotate and how
 */

import type { GameAnalysis, MoveAnalysis, CriticalMoment } from '@chessbeast/core';

import type { TokenBudget } from '../config/llm-config.js';
import type { VerbosityLevel, CommentContext } from '../prompts/templates.js';

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
 * Calculate priority score for a position
 */
function calculatePriority(move: MoveAnalysis, criticalMoment?: CriticalMoment): number {
  let priority = 0;

  // Critical moment score (0-100)
  if (criticalMoment) {
    priority += criticalMoment.score;
  }

  // Classification bonus
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
  priority += classificationBonus[move.classification] ?? 0;

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
 * Build comment context for a planned annotation
 */
export function buildCommentContext(
  planned: PlannedAnnotation,
  targetRating: number,
  legalMoves: string[],
  openingName?: string,
): CommentContext {
  const { move, criticalMoment, verbosity } = planned;
  const moveNotation = `${move.moveNumber}${move.isWhiteMove ? '.' : '...'} ${move.san}`;

  return {
    move,
    criticalMoment,
    targetRating,
    verbosity,
    legalMoves,
    openingName,
    moveNotation,
  };
}
