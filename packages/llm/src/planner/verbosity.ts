/**
 * Verbosity calculation for adaptive annotation depth
 */

import type { VerbosityLevel } from '../prompts/templates.js';

/**
 * Estimated tokens per verbosity level
 */
export const TOKENS_BY_VERBOSITY: Record<VerbosityLevel, number> = {
  brief: 100,
  normal: 250,
  detailed: 450,
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
  if (remainingPositions === 0) return 'brief';

  const avgBudgetPerPosition = remainingBudget / remainingPositions;

  // If severely budget-constrained, always use brief
  if (avgBudgetPerPosition < 100) {
    return 'brief';
  }

  // Critical moments get at least normal verbosity if budget allows
  if (isCritical) {
    if (avgBudgetPerPosition >= TOKENS_BY_VERBOSITY.detailed) {
      return userPreference === 'detailed' ? 'detailed' : 'normal';
    }
    if (avgBudgetPerPosition >= TOKENS_BY_VERBOSITY.normal) {
      return 'normal';
    }
    return 'brief';
  }

  // Non-critical positions follow user preference with budget constraints
  if (userPreference === 'detailed' && avgBudgetPerPosition < TOKENS_BY_VERBOSITY.detailed) {
    return avgBudgetPerPosition >= TOKENS_BY_VERBOSITY.normal ? 'normal' : 'brief';
  }

  if (userPreference === 'normal' && avgBudgetPerPosition < TOKENS_BY_VERBOSITY.normal) {
    return 'brief';
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
 */
export function shouldAnnotate(
  classification: string,
  isCritical: boolean,
  humanProbability?: number,
): boolean {
  // Always annotate critical moments
  if (isCritical) return true;

  // Annotate interesting move classifications
  const interestingClassifications = ['blunder', 'mistake', 'brilliant', 'excellent'];
  if (interestingClassifications.includes(classification)) return true;

  // Annotate unexpected moves (low human probability)
  if (humanProbability !== undefined && humanProbability < 0.1) return true;

  return false;
}
