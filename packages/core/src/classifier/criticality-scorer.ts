/**
 * Criticality Scorer
 *
 * Multi-factor scoring system for determining position criticality.
 * Extends the existing interestingness scoring with additional factors
 * for tactical volatility, theme novelty, and king safety.
 *
 * Used by the staged analysis pipeline to determine which positions
 * should be promoted to higher analysis tiers.
 */

import type { AnalysisTier } from '../storage/artifacts/base.js';

import { calculateWinProbDrop, WIN_PROB_THRESHOLDS } from './win-probability.js';

/**
 * Individual factors contributing to criticality score
 */
export interface CriticalityFactors {
  /** Win probability change (0-100 scale) */
  winProbDelta: number;

  /** Centipawn change (absolute value) */
  cpDelta: number;

  /** Tactical volatility score (0-1) */
  tacticalVolatility: number;

  /** Theme novelty score (0-1) - new themes emerged */
  themeNovelty: number;

  /** King safety risk score (0-1) */
  kingSafetyRisk: number;

  /** Repetition penalty (0-1) - already explained */
  repetitionPenalty: number;
}

/**
 * Complete criticality score with breakdown
 */
export interface CriticalityScore {
  /** Overall score (0-100) */
  score: number;

  /** Individual factor contributions */
  factors: CriticalityFactors;

  /** Recommended analysis tier based on score */
  recommendedTier: AnalysisTier;

  /** Human-readable reason for the score */
  reason: string;
}

/**
 * Criticality level classification
 */
export type CriticalityLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Weight configuration for criticality factors
 */
export interface CriticalityWeights {
  winProbDelta: number;
  cpDelta: number;
  tacticalVolatility: number;
  themeNovelty: number;
  kingSafetyRisk: number;
  repetitionPenalty: number;
}

/**
 * Default weights for criticality scoring
 *
 * Total positive weights = 1.0 (100%)
 * Repetition penalty is subtracted
 */
export const DEFAULT_WEIGHTS: CriticalityWeights = {
  winProbDelta: 0.3, // Primary signal
  cpDelta: 0.25, // Secondary signal
  tacticalVolatility: 0.2, // Forcing positions
  themeNovelty: 0.15, // New ideas
  kingSafetyRisk: 0.1, // King attacks
  repetitionPenalty: 0.1, // Avoid redundancy
};

/**
 * Thresholds for tier promotion
 */
export const TIER_PROMOTION_THRESHOLDS = {
  /** Score threshold for promoting to standard tier */
  standard: 40,
  /** Score threshold for promoting to full tier */
  full: 70,
} as const;

/**
 * Thresholds for criticality level classification
 */
export const CRITICALITY_LEVEL_THRESHOLDS = {
  medium: 25,
  high: 50,
  critical: 75,
} as const;

/**
 * Options for criticality calculation
 */
export interface CriticalityOptions {
  /** Number of tactical themes detected (pins, forks, etc.) */
  tacticalThemes?: number;

  /** Number of newly emerged themes */
  newThemes?: number;

  /** King safety delta (negative = more exposed) */
  kingSafetyDelta?: number;

  /** Whether this idea has already been explained */
  alreadyExplained?: boolean;

  /** Custom weights (defaults to DEFAULT_WEIGHTS) */
  weights?: Partial<CriticalityWeights>;

  /** Player rating for threshold adjustment */
  playerRating?: number;
}

/**
 * Calculate normalized win probability delta factor (0-1)
 *
 * Uses the blunder threshold (20%) as the reference point.
 * Values above blunder threshold approach 1.0.
 */
function calculateWinProbFactor(winProbDelta: number): number {
  const absWinProbDelta = Math.abs(winProbDelta);
  // Scale so that blunder threshold (20%) maps to ~0.8
  return Math.min(1, absWinProbDelta / (WIN_PROB_THRESHOLDS.blunder * 1.25));
}

/**
 * Calculate normalized centipawn delta factor (0-1)
 *
 * Uses 200cp as the reference point for significant change.
 * Larger values approach 1.0.
 */
function calculateCpFactor(cpDelta: number): number {
  const absCpDelta = Math.abs(cpDelta);
  // Scale so that 200cp maps to ~0.7
  return Math.min(1, absCpDelta / 300);
}

/**
 * Calculate tactical volatility factor (0-1)
 *
 * Based on the number of tactical themes present.
 * More tactical themes = higher volatility.
 */
function calculateTacticalVolatilityFactor(tacticalThemes: number): number {
  // 0 themes = 0, 1 theme = 0.4, 2 themes = 0.7, 3+ themes = 0.9+
  if (tacticalThemes === 0) return 0;
  if (tacticalThemes === 1) return 0.4;
  if (tacticalThemes === 2) return 0.7;
  return Math.min(1, 0.9 + (tacticalThemes - 3) * 0.05);
}

/**
 * Calculate theme novelty factor (0-1)
 *
 * Based on how many new themes emerged in this position.
 */
function calculateThemeNoveltyFactor(newThemes: number): number {
  // Each new theme adds to novelty, diminishing returns
  if (newThemes === 0) return 0;
  if (newThemes === 1) return 0.5;
  if (newThemes === 2) return 0.75;
  return Math.min(1, 0.85 + (newThemes - 3) * 0.05);
}

/**
 * Calculate king safety risk factor (0-1)
 *
 * Based on how much the king safety changed.
 * Negative delta (more exposed) increases risk.
 */
function calculateKingSafetyFactor(kingSafetyDelta: number): number {
  // Only penalize for increased exposure (negative delta)
  if (kingSafetyDelta >= 0) return 0;

  // Scale: -100 = significant exposure increase
  const absExposure = Math.abs(kingSafetyDelta);
  return Math.min(1, absExposure / 150);
}

/**
 * Determine recommended tier based on criticality score
 */
function determineRecommendedTier(score: number): AnalysisTier {
  if (score >= TIER_PROMOTION_THRESHOLDS.full) return 'full';
  if (score >= TIER_PROMOTION_THRESHOLDS.standard) return 'standard';
  return 'shallow';
}

/**
 * Generate human-readable reason for the criticality score
 */
function generateReason(factors: CriticalityFactors, score: number): string {
  const reasons: string[] = [];

  if (factors.winProbDelta > 10) {
    reasons.push(`${factors.winProbDelta.toFixed(1)}% win probability change`);
  }

  if (factors.cpDelta > 100) {
    reasons.push(`${Math.round(factors.cpDelta)}cp eval swing`);
  }

  if (factors.tacticalVolatility > 0.5) {
    reasons.push('tactical complexity');
  }

  if (factors.themeNovelty > 0.5) {
    reasons.push('new themes emerged');
  }

  if (factors.kingSafetyRisk > 0.5) {
    reasons.push('king safety concerns');
  }

  if (factors.repetitionPenalty > 0.5) {
    reasons.push('(already explained)');
  }

  if (reasons.length === 0) {
    if (score < CRITICALITY_LEVEL_THRESHOLDS.medium) {
      return 'quiet position';
    }
    return 'moderate interest';
  }

  return reasons.join(', ');
}

/**
 * Calculate criticality score for a position
 *
 * @param evalBefore - Eval before move (from moving player's perspective)
 * @param evalAfter - Eval after move (from opponent's perspective)
 * @param options - Additional factors and configuration
 * @returns Complete criticality score with breakdown
 */
export function calculateCriticality(
  evalBefore: number,
  evalAfter: number,
  options: CriticalityOptions = {},
): CriticalityScore {
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights };

  // Calculate raw factors
  const winProbDelta = Math.abs(calculateWinProbDrop(evalBefore, evalAfter));
  const cpDelta = Math.abs(evalBefore + evalAfter); // evalAfter is from opponent's view

  // Build factors object
  const factors: CriticalityFactors = {
    winProbDelta,
    cpDelta,
    tacticalVolatility: calculateTacticalVolatilityFactor(options.tacticalThemes ?? 0),
    themeNovelty: calculateThemeNoveltyFactor(options.newThemes ?? 0),
    kingSafetyRisk: calculateKingSafetyFactor(options.kingSafetyDelta ?? 0),
    repetitionPenalty: options.alreadyExplained ? 1 : 0,
  };

  // Calculate weighted score
  const normalizedWinProb = calculateWinProbFactor(winProbDelta);
  const normalizedCp = calculateCpFactor(cpDelta);

  let score =
    normalizedWinProb * weights.winProbDelta * 100 +
    normalizedCp * weights.cpDelta * 100 +
    factors.tacticalVolatility * weights.tacticalVolatility * 100 +
    factors.themeNovelty * weights.themeNovelty * 100 +
    factors.kingSafetyRisk * weights.kingSafetyRisk * 100 -
    factors.repetitionPenalty * weights.repetitionPenalty * 100;

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    factors,
    recommendedTier: determineRecommendedTier(score),
    reason: generateReason(factors, score),
  };
}

/**
 * Convert criticality score to a level classification
 */
export function scoreToCriticalityLevel(score: number): CriticalityLevel {
  if (score >= CRITICALITY_LEVEL_THRESHOLDS.critical) return 'critical';
  if (score >= CRITICALITY_LEVEL_THRESHOLDS.high) return 'high';
  if (score >= CRITICALITY_LEVEL_THRESHOLDS.medium) return 'medium';
  return 'low';
}

/**
 * Determine if a position should be promoted to a higher tier
 *
 * @param currentTier - Current analysis tier
 * @param criticalityScore - Calculated criticality score
 * @returns The tier the position should be promoted to (may be same as current)
 */
export function shouldPromoteTier(
  currentTier: AnalysisTier,
  criticalityScore: number,
): AnalysisTier {
  const recommended = determineRecommendedTier(criticalityScore);

  // Only promote, never demote
  const tierOrder: Record<AnalysisTier, number> = {
    shallow: 0,
    standard: 1,
    full: 2,
  };

  if (tierOrder[recommended] > tierOrder[currentTier]) {
    return recommended;
  }

  return currentTier;
}

/**
 * Quick criticality check using only eval delta
 *
 * Useful for fast filtering before full calculation.
 *
 * @param evalBefore - Eval before move
 * @param evalAfter - Eval after move
 * @returns true if position might be critical
 */
export function quickCriticalityCheck(evalBefore: number, evalAfter: number): boolean {
  const winProbDelta = Math.abs(calculateWinProbDrop(evalBefore, evalAfter));
  return winProbDelta >= WIN_PROB_THRESHOLDS.dubious;
}

/**
 * Create a criticality score from pre-computed factors
 *
 * Useful when factors are calculated separately.
 */
export function createCriticalityScore(
  factors: CriticalityFactors,
  weights: CriticalityWeights = DEFAULT_WEIGHTS,
): CriticalityScore {
  const normalizedWinProb = calculateWinProbFactor(factors.winProbDelta);
  const normalizedCp = calculateCpFactor(factors.cpDelta);

  let score =
    normalizedWinProb * weights.winProbDelta * 100 +
    normalizedCp * weights.cpDelta * 100 +
    factors.tacticalVolatility * weights.tacticalVolatility * 100 +
    factors.themeNovelty * weights.themeNovelty * 100 +
    factors.kingSafetyRisk * weights.kingSafetyRisk * 100 -
    factors.repetitionPenalty * weights.repetitionPenalty * 100;

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    factors,
    recommendedTier: determineRecommendedTier(score),
    reason: generateReason(factors, score),
  };
}
