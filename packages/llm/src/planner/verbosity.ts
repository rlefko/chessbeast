/**
 * Verbosity calculation for adaptive annotation depth
 */

import type { VerbosityLevel } from '../prompts/templates.js';

/**
 * Estimated TOTAL tokens per verbosity level (prompt + completion)
 *
 * Breakdown:
 * - System prompt: ~200 tokens (simplified)
 * - User prompt (FEN, moves, context): ~200-400 tokens
 * - Completion: ~50-300 tokens
 *
 * These estimates are intentionally generous to avoid budget exhaustion issues.
 * Actual usage may be lower, which just means we can annotate more moves.
 */
export const TOKENS_BY_VERBOSITY: Record<VerbosityLevel, number> = {
  'ultra-brief': 400, // ~300 prompt + ~50 completion (5-8 words)
  brief: 600, // ~400 prompt + ~100 completion
  normal: 800, // ~500 prompt + ~300 completion
  detailed: 1100, // ~600 prompt + ~500 completion
};

/**
 * Word limits by verbosity level
 * - ultra-brief: Maximum 8 words for critical, 5 for non-critical
 * - brief: Maximum 15 words for critical, 10 for non-critical
 * - normal: Maximum 25 words for critical, 10 for non-critical
 * - detailed: Maximum 40 words for critical, 15 for non-critical
 */
export const WORD_LIMITS: Record<VerbosityLevel, { critical: number; nonCritical: number }> = {
  'ultra-brief': { critical: 8, nonCritical: 5 },
  brief: { critical: 15, nonCritical: 10 },
  normal: { critical: 25, nonCritical: 10 },
  detailed: { critical: 40, nonCritical: 15 },
};

/**
 * Calculate appropriate verbosity level based on budget and position importance
 */
export function calculateVerbosity(
  remainingBudget: number,
  remainingPositions: number,
  isCritical: boolean,
  userPreference: VerbosityLevel,
): VerbosityLevel {
  if (remainingPositions === 0) return 'ultra-brief';

  const avgBudgetPerPosition = remainingBudget / remainingPositions;

  // If severely budget-constrained, use ultra-brief
  if (avgBudgetPerPosition < 200) {
    return 'ultra-brief';
  }

  // Critical moments get at least brief verbosity if budget allows
  if (isCritical) {
    if (avgBudgetPerPosition >= TOKENS_BY_VERBOSITY.detailed) {
      return userPreference === 'detailed' ? 'detailed' : 'normal';
    }
    if (avgBudgetPerPosition >= TOKENS_BY_VERBOSITY.normal) {
      return 'normal';
    }
    if (avgBudgetPerPosition >= TOKENS_BY_VERBOSITY.brief) {
      return 'brief';
    }
    return 'ultra-brief';
  }

  // Non-critical positions follow user preference with budget constraints
  if (userPreference === 'detailed' && avgBudgetPerPosition < TOKENS_BY_VERBOSITY.detailed) {
    if (avgBudgetPerPosition >= TOKENS_BY_VERBOSITY.normal) return 'normal';
    if (avgBudgetPerPosition >= TOKENS_BY_VERBOSITY.brief) return 'brief';
    return 'ultra-brief';
  }

  if (userPreference === 'normal' && avgBudgetPerPosition < TOKENS_BY_VERBOSITY.normal) {
    if (avgBudgetPerPosition >= TOKENS_BY_VERBOSITY.brief) return 'brief';
    return 'ultra-brief';
  }

  if (userPreference === 'brief' && avgBudgetPerPosition < TOKENS_BY_VERBOSITY.brief) {
    return 'ultra-brief';
  }

  return userPreference;
}

/**
 * Estimate tokens needed for a position based on verbosity
 */
export function estimateTokens(verbosity: VerbosityLevel, isCritical: boolean): number {
  const base = TOKENS_BY_VERBOSITY[verbosity];
  // Critical moments tend to generate slightly longer responses
  return isCritical ? Math.ceil(base * 1.3) : base;
}

/**
 * Determine if a position should be annotated based on its classification and importance
 *
 * We are now MORE SELECTIVE to avoid cluttering output with comments on moves
 * where the NAG (!, !!, ?, ??) already communicates the quality. We only generate
 * LLM comments for:
 * - Errors (blunders, mistakes, inaccuracies) where we can explain WHY
 * - Critical moments that mark turning points
 * - Very unusual moves (low human probability)
 *
 * We SKIP:
 * - "excellent" and "brilliant" moves (NAG !/!! is sufficient)
 * - "good" and "book" moves (nothing to say)
 * - Forced moves (no choice was made)
 */
export function shouldAnnotate(
  classification: string,
  isCritical: boolean,
  humanProbability?: number,
): boolean {
  // Critical moments are the key teaching moments - always annotate
  if (isCritical) return true;

  // Annotate very unexpected moves (low human probability)
  // These might be interesting tactical or creative moves
  // Check this BEFORE skipping classifications, since unusual moves override
  if (humanProbability !== undefined && humanProbability < 0.05) return true;

  // Skip "good" moves (including excellent/brilliant) - NAG is sufficient
  // The glyph ! or !! already tells the reader this was a good move
  // We don't need to say "this was a strong move" in text
  const skipClassifications = ['excellent', 'brilliant', 'good', 'book', 'forced'];
  if (skipClassifications.includes(classification)) return false;

  // Annotate errors - these have educational value
  // We can explain WHY it was a mistake
  const errorClassifications = ['blunder', 'mistake', 'inaccuracy'];
  if (errorClassifications.includes(classification)) return true;

  return false;
}
