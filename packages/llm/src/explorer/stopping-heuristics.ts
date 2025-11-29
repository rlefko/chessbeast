/**
 * Hybrid Stopping Heuristics for Agentic Exploration
 *
 * Combines multiple signals to determine whether exploration should continue:
 * - Tactical tension (hanging pieces, checks, captures)
 * - Evaluation swings (significant change from previous position)
 * - Resolution state (winning/drawn positions)
 * - Budget awareness (soft/hard caps on tool calls and depth)
 */

import { hasTacticalTension, getResolutionState } from '@chessbeast/pgn';

/**
 * Continuation assessment result
 */
export interface ContinuationAssessment {
  /** Whether exploration should continue */
  shouldContinue: boolean;
  /** Confidence in this assessment (0-100) */
  confidence: number;
  /** Human-readable reasons for this assessment */
  reasons: string[];
  /** Suggested action */
  suggestion: 'explore_deeper' | 'wrap_up' | 'stop_now';
  /** Interest score (higher = more interesting, used for decision) */
  interestScore: number;
}

/**
 * Configuration for stopping heuristics
 */
export interface StoppingConfig {
  /** Hard cap on variation depth (default: 50) */
  maxDepth: number;
  /** Hard cap on tool calls (default: 40) */
  maxToolCalls: number;
  /** Soft cap that triggers wrap-up guidance (default: 25) */
  softToolCap: number;
  /** Eval swing threshold in centipawns (default: 100) */
  evalSwingThreshold: number;
  /** Below this score, stop exploring (default: 20) */
  interestingnessFloor: number;
}

/**
 * Default stopping configuration
 */
export const DEFAULT_STOPPING_CONFIG: StoppingConfig = {
  maxDepth: 50,
  maxToolCalls: 40,
  softToolCap: 25,
  evalSwingThreshold: 100,
  interestingnessFloor: 20,
};

/**
 * Assess whether to continue exploring the current position
 *
 * Uses a scoring system that combines:
 * 1. Tactical tension (+30 if present)
 * 2. Evaluation swing (+25 if significant)
 * 3. Resolution state (-15 if decisive, +15 if unresolved)
 * 4. Budget pressure (scales score down as approaching limit)
 * 5. Depth penalty (-2 per move past 20)
 *
 * @param fen - Current position FEN
 * @param prevEval - Previous position evaluation (centipawns)
 * @param currentEval - Current position evaluation (centipawns)
 * @param depth - Current exploration depth (number of moves)
 * @param toolCallsUsed - Number of tool calls used so far
 * @param config - Stopping configuration
 * @returns Assessment of whether to continue
 */
export function assessContinuation(
  fen: string,
  prevEval: number | undefined,
  currentEval: number | undefined,
  depth: number,
  toolCallsUsed: number,
  config: StoppingConfig = DEFAULT_STOPPING_CONFIG,
): ContinuationAssessment {
  const reasons: string[] = [];
  let score = 50; // Start neutral

  // 1. HARD LIMITS - Check immediately
  if (depth >= config.maxDepth) {
    return {
      shouldContinue: false,
      confidence: 100,
      reasons: [`Maximum depth reached (${config.maxDepth} moves)`],
      suggestion: 'stop_now',
      interestScore: 0,
    };
  }

  if (toolCallsUsed >= config.maxToolCalls) {
    return {
      shouldContinue: false,
      confidence: 100,
      reasons: [`Tool call limit reached (${config.maxToolCalls} calls)`],
      suggestion: 'stop_now',
      interestScore: 0,
    };
  }

  // 2. TACTICAL TENSION
  const hasTension = hasTacticalTension(fen);
  if (hasTension) {
    score += 30;
    reasons.push('Position has tactical tension');
  } else {
    score -= 20;
    reasons.push('Position is quiet');
  }

  // 3. EVALUATION SWING
  if (prevEval !== undefined && currentEval !== undefined) {
    const swing = Math.abs(currentEval - prevEval);
    if (swing >= config.evalSwingThreshold) {
      score += 25;
      reasons.push(`Large eval swing: ${swing}cp`);
    } else if (swing >= config.evalSwingThreshold / 2) {
      score += 10;
      reasons.push(`Moderate eval swing: ${swing}cp`);
    }
  }

  // 4. RESOLUTION STATE
  const resolution = getResolutionState(
    fen,
    currentEval !== undefined ? { cp: currentEval } : undefined,
  );

  switch (resolution.state) {
    case 'winning_white':
    case 'winning_black':
      score -= 15;
      reasons.push(`Position is decisive: ${resolution.reason}`);
      break;
    case 'draw':
      score -= 20;
      reasons.push(`Position is drawn: ${resolution.reason}`);
      break;
    case 'unresolved':
      score += 15;
      reasons.push(`Position unresolved: ${resolution.reason}`);
      break;
    case 'quiet':
      // No change to score
      reasons.push(`Position is quiet: ${resolution.reason}`);
      break;
  }

  // 5. BUDGET PRESSURE
  const budgetRatio = toolCallsUsed / config.softToolCap;
  if (budgetRatio >= 1.0) {
    // Past soft cap - apply significant pressure
    const overBudgetFactor = Math.max(0.3, 1.0 - (budgetRatio - 1.0) * 0.5);
    score = score * overBudgetFactor;
    reasons.push(`Over budget (${toolCallsUsed}/${config.softToolCap} tool calls)`);
  } else if (budgetRatio >= 0.8) {
    // Approaching soft cap - mild pressure
    const pressureFactor = 1.0 - (budgetRatio - 0.8) * 0.5;
    score = score * pressureFactor;
    reasons.push(`Approaching budget limit`);
  }

  // 6. DEPTH PENALTY
  if (depth > 20) {
    const depthPenalty = (depth - 20) * 2;
    score -= depthPenalty;
    reasons.push(`Deep variation (${depth} moves, -${depthPenalty})`);
  }

  // 7. EARLY GAME BONUS - Don't stop too early
  if (depth < 4) {
    score += 20;
    reasons.push('Variation is short, continue exploring');
  }

  // DECISION
  const shouldContinue = score > config.interestingnessFloor;

  let suggestion: 'explore_deeper' | 'wrap_up' | 'stop_now';
  if (score > 60) {
    suggestion = 'explore_deeper';
  } else if (score > config.interestingnessFloor) {
    suggestion = 'wrap_up';
  } else {
    suggestion = 'stop_now';
  }

  // Calculate confidence based on how far from the threshold we are
  const distanceFromThreshold = Math.abs(score - config.interestingnessFloor);
  const confidence = Math.min(100, distanceFromThreshold * 2);

  return {
    shouldContinue,
    confidence,
    reasons,
    suggestion,
    interestScore: Math.round(score),
  };
}

/**
 * Quick check if exploration should definitely stop
 *
 * Faster than full assessment for common cases.
 *
 * @param depth - Current depth
 * @param toolCallsUsed - Tool calls used
 * @param config - Stopping configuration
 * @returns true if hard limit reached
 */
export function shouldHardStop(
  depth: number,
  toolCallsUsed: number,
  config: StoppingConfig = DEFAULT_STOPPING_CONFIG,
): boolean {
  return depth >= config.maxDepth || toolCallsUsed >= config.maxToolCalls;
}

/**
 * Get budget guidance message for LLM
 *
 * @param toolCallsUsed - Tool calls used
 * @param config - Stopping configuration
 * @returns Guidance message or undefined if no guidance needed
 */
export function getBudgetGuidance(
  toolCallsUsed: number,
  config: StoppingConfig = DEFAULT_STOPPING_CONFIG,
): string | undefined {
  const remaining = config.maxToolCalls - toolCallsUsed;
  const softRemaining = config.softToolCap - toolCallsUsed;

  if (remaining <= 3) {
    return `CRITICAL: Only ${remaining} tool calls remaining. Use finish_exploration soon.`;
  }

  if (remaining <= 5) {
    return `WARNING: Only ${remaining} tool calls remaining. Start wrapping up.`;
  }

  if (softRemaining <= 0 && remaining > 5) {
    return `Note: Past soft budget (${toolCallsUsed}/${config.softToolCap}). Consider wrapping up exploration.`;
  }

  if (softRemaining <= 5 && softRemaining > 0) {
    return `Budget: ${toolCallsUsed}/${config.softToolCap} tool calls used. Consider when to finish.`;
  }

  return undefined;
}
