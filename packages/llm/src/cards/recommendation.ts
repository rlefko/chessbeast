/**
 * Exploration Recommendation Algorithm
 *
 * Calculates EXPLORE / BRIEF / SKIP recommendations based on position characteristics.
 */

import type { CandidateMove, CardTier, ExplorationRecommendation } from './types.js';

export interface RecommendationInput {
  candidates: CandidateMove[];
  evaluation: { cp: number; isMate: boolean };
  treeDepth: number;
  isTerminal: boolean;
  terminalReason?: 'checkmate' | 'stalemate' | 'insufficient_material' | 'draw_claim';
}

/**
 * Calculate exploration recommendation for a position
 */
export function calculateRecommendation(input: RecommendationInput): {
  action: ExplorationRecommendation;
  reason: string;
} {
  const { candidates, evaluation, treeDepth, isTerminal, terminalReason } = input;

  // Terminal position = SKIP
  if (isTerminal) {
    const reason = terminalReason === 'checkmate' ? 'checkmate' : terminalReason || 'terminal';
    return { action: 'SKIP', reason };
  }

  // Very deep in variation = SKIP
  if (treeDepth > 15) {
    return { action: 'SKIP', reason: 'deep in variation' };
  }

  // Decisive advantage = BRIEF (show winning line, don't over-explore)
  if (evaluation.isMate) {
    return { action: 'BRIEF', reason: 'forced mate found' };
  }
  if (Math.abs(evaluation.cp) >= 500) {
    return { action: 'BRIEF', reason: 'position already decisive' };
  }

  // Has attractive-but-bad = EXPLORE (show refutation)
  const hasAttractiveBad = candidates.some((c) => c.source === 'attractive_but_bad');
  if (hasAttractiveBad) {
    return { action: 'EXPLORE', reason: 'attractive trap to refute' };
  }

  // Has sacrifice = EXPLORE (show tactical idea)
  const hasSacrifice = candidates.some((c) => c.source === 'sacrifice');
  if (hasSacrifice) {
    return { action: 'EXPLORE', reason: 'sacrifice worth showing' };
  }

  // Multiple good alternatives = EXPLORE
  const nearBestCount = candidates.filter(
    (c) => c.source === 'engine_best' || c.source === 'near_best',
  ).length;
  if (nearBestCount >= 3) {
    return { action: 'EXPLORE', reason: 'multiple strong alternatives' };
  }

  // Human-popular differs from engine best = EXPLORE
  const humanPopular = candidates.find((c) => c.source === 'human_popular');
  const engineBest = candidates.find((c) => c.source === 'engine_best');
  if (humanPopular && engineBest && humanPopular.san !== engineBest.san) {
    return { action: 'EXPLORE', reason: 'human choice differs from best' };
  }

  // Moderate depth with clear best = BRIEF
  if (treeDepth > 8) {
    return { action: 'BRIEF', reason: 'continuation of established line' };
  }

  // Close to equal with few alternatives = BRIEF
  if (Math.abs(evaluation.cp) < 50 && nearBestCount <= 1) {
    return { action: 'BRIEF', reason: 'quiet position with clear path' };
  }

  // Default = EXPLORE for early positions
  return { action: 'EXPLORE', reason: 'position worth investigating' };
}

/**
 * Select appropriate card tier based on exploration context
 *
 * Tiers reduce analysis depth for deep variations to improve performance:
 * - Initial positions get full analysis
 * - Shallow depths get standard analysis
 * - Deeper variations get progressively lighter analysis
 *
 * @param treeDepth - Depth in the variation tree (0 = root)
 * @param isInitialPosition - Whether this is the initial position being explored
 * @param recommendation - Optional recommendation (SKIP triggers minimal tier)
 * @returns The appropriate card tier for this context
 */
export function selectCardTier(
  treeDepth: number,
  isInitialPosition: boolean = false,
  recommendation?: ExplorationRecommendation,
): CardTier {
  // Initial position always gets full analysis
  if (isInitialPosition) {
    return 'full';
  }

  // SKIP recommendation = minimal card (just for stopping heuristics)
  if (recommendation === 'SKIP') {
    return 'minimal';
  }

  // Depth-based tier selection
  if (treeDepth <= 6) {
    return 'standard';
  }
  if (treeDepth <= 12) {
    return 'shallow';
  }

  return 'minimal';
}
