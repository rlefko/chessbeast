/**
 * Comment Intents
 *
 * Defines the intent system for post-write comment synthesis.
 * Each intent represents a reason to add a comment with associated
 * priority scoring and content requirements.
 */

import type { CriticalityScore } from '@chessbeast/core';

import type { IdeaKey } from '../themes/idea-keys.js';
import type { ThemeDelta, ThemeInstance } from '../themes/types.js';

/**
 * Types of comments that can be generated
 */
export type CommentIntentType =
  | 'why_this_move' // Explain why the played move is good/best
  | 'what_was_missed' // Explain what better move was missed
  | 'tactical_shot' // Highlight a tactical opportunity
  | 'strategic_plan' // Explain strategic ideas/plans
  | 'endgame_technique' // Explain endgame technique
  | 'human_move' // Explain human/practical move choice
  | 'theme_emergence' // New theme has appeared
  | 'theme_resolution' // Theme has been resolved
  | 'critical_moment' // Turning point in the game
  | 'blunder_explanation'; // Explain why move was a blunder

/**
 * Content for the comment intent
 */
export interface IntentContent {
  /** The move being commented on (SAN) */
  move: string;

  /** Move number */
  moveNumber: number;

  /** Whether this is a white move */
  isWhiteMove: boolean;

  /** Best alternative move (if applicable) */
  bestAlternative?: string;

  /** Primary variation to show */
  variation?: string[];

  /** Theme explanation text */
  themeExplanation?: string;

  /** Idea keys for redundancy tracking */
  ideaKeys: IdeaKey[];

  /** Evaluation before the move */
  evalBefore?: number;

  /** Evaluation after the move */
  evalAfter?: number;

  /** Win probability change */
  winProbDelta?: number;
}

/**
 * Score breakdown for intent prioritization
 */
export interface IntentScoreBreakdown {
  /** Criticality contribution (0-1) */
  criticality: number;

  /** Theme novelty contribution (0-1) */
  themeNovelty: number;

  /** Instructional value (0-1) */
  instructionalValue: number;

  /** Redundancy penalty (0-1, subtracted) */
  redundancyPenalty: number;

  /** Final computed score */
  totalScore: number;
}

/**
 * Default weights for intent scoring
 */
export const INTENT_SCORE_WEIGHTS = {
  criticality: 0.35,
  themeNovelty: 0.25,
  instructionalValue: 0.25,
  redundancyPenalty: 0.15,
} as const;

/**
 * Comment intent representing a potential comment
 */
export interface CommentIntent {
  /** Type of comment */
  type: CommentIntentType;

  /** Ply index in the game */
  plyIndex: number;

  /** Priority score (higher = more important) */
  priority: number;

  /** Theme deltas associated with this position */
  themeDeltas?: ThemeDelta[];

  /** Active themes at this position */
  activeThemes?: ThemeInstance[];

  /** Content for generating the comment */
  content: IntentContent;

  /** Score breakdown for debugging/analysis */
  scoreBreakdown: IntentScoreBreakdown;

  /** Whether this intent is mandatory (e.g., blunders) */
  mandatory: boolean;

  /** Suggested comment length */
  suggestedLength: 'brief' | 'standard' | 'detailed';
}

/**
 * Configuration for intent generation
 */
export interface IntentGeneratorConfig {
  /** Minimum priority to include an intent (default: 0.2) */
  minPriority: number;

  /** Always include intents for moves with this eval swing (default: 150) */
  mandatoryEvalSwing: number;

  /** Always include intents for these theme severities */
  mandatoryThemeSeverities: ('critical' | 'significant')[];

  /** Custom weights for scoring */
  weights?: Partial<typeof INTENT_SCORE_WEIGHTS>;
}

/**
 * Default intent generator configuration
 */
export const DEFAULT_INTENT_CONFIG: IntentGeneratorConfig = {
  minPriority: 0.2,
  mandatoryEvalSwing: 150,
  mandatoryThemeSeverities: ['critical'],
  weights: INTENT_SCORE_WEIGHTS,
};

/**
 * Input for creating a comment intent
 */
export interface IntentInput {
  /** Move being analyzed */
  move: string;

  /** Move number */
  moveNumber: number;

  /** Whether white played this move */
  isWhiteMove: boolean;

  /** Ply index in game */
  plyIndex: number;

  /** Criticality score for this position */
  criticalityScore: CriticalityScore;

  /** Theme deltas at this position */
  themeDeltas: ThemeDelta[];

  /** Active themes at this position */
  activeThemes: ThemeInstance[];

  /** Best alternative move if different from played */
  bestMove?: string;

  /** Principal variation */
  pv?: string[];

  /** Evaluation before move */
  evalBefore?: number;

  /** Evaluation after move */
  evalAfter?: number;

  /** Previously explained idea keys */
  explainedIdeaKeys: Set<string>;
}

/**
 * Determine the intent type based on the analysis
 */
export function determineIntentType(input: IntentInput): CommentIntentType {
  const { criticalityScore, themeDeltas, bestMove, move, evalBefore, evalAfter } = input;

  // Check for significant eval swing (blunder/mistake)
  if (evalBefore !== undefined && evalAfter !== undefined) {
    const evalChange = Math.abs(evalAfter - evalBefore);
    if (evalChange >= 300) {
      return 'blunder_explanation';
    }
    if (evalChange >= 150 && bestMove && bestMove !== move) {
      return 'what_was_missed';
    }
  }

  // Check for critical themes
  const criticalThemes = themeDeltas.filter(
    (d) =>
      d.transition === 'emerged' &&
      (d.theme.severity === 'critical' || d.theme.severity === 'significant'),
  );

  if (criticalThemes.length > 0) {
    // Check if tactical
    const hasTactical = criticalThemes.some((d) => d.theme.category === 'tactical');
    if (hasTactical) {
      return 'tactical_shot';
    }
    return 'theme_emergence';
  }

  // Check for theme resolution
  const resolvedThemes = themeDeltas.filter(
    (d) =>
      d.transition === 'resolved' &&
      (d.theme.severity === 'critical' || d.theme.severity === 'significant'),
  );

  if (resolvedThemes.length > 0) {
    return 'theme_resolution';
  }

  // High criticality suggests critical moment
  if (criticalityScore.score >= 70) {
    return 'critical_moment';
  }

  // Check if best move was played
  if (bestMove && bestMove === move && criticalityScore.score >= 40) {
    return 'why_this_move';
  }

  // Default to strategic plan
  return 'strategic_plan';
}

/**
 * Calculate the instructional value of an intent
 */
export function calculateInstructionalValue(input: IntentInput): number {
  let value = 0;

  // Theme deltas increase instructional value
  const emergedThemes = input.themeDeltas.filter((d) => d.transition === 'emerged');
  value += Math.min(0.4, emergedThemes.length * 0.15);

  // Tactical themes are highly instructional
  const tacticalThemes = emergedThemes.filter((d) => d.theme.category === 'tactical');
  value += Math.min(0.3, tacticalThemes.length * 0.15);

  // Eval swings indicate teaching moments
  if (input.evalBefore !== undefined && input.evalAfter !== undefined) {
    const swing = Math.abs(input.evalAfter - input.evalBefore);
    if (swing >= 100) value += 0.2;
    else if (swing >= 50) value += 0.1;
  }

  // Alternative moves to show
  if (input.bestMove && input.bestMove !== input.move) {
    value += 0.1;
  }

  return Math.min(1, value);
}

/**
 * Calculate the redundancy penalty for an intent
 */
export function calculateRedundancyPenalty(input: IntentInput): number {
  let penalty = 0;

  // Check how many idea keys have already been explained
  for (const delta of input.themeDeltas) {
    const themeKey = delta.theme.themeKey;
    if (input.explainedIdeaKeys.has(themeKey)) {
      penalty += 0.25;
    }
  }

  return Math.min(1, penalty);
}

/**
 * Calculate the theme novelty score
 */
export function calculateThemeNovelty(input: IntentInput): number {
  if (input.themeDeltas.length === 0) {
    return 0;
  }

  // Average novelty of emerged themes
  const emergedThemes = input.themeDeltas.filter((d) => d.transition === 'emerged');
  if (emergedThemes.length === 0) {
    return 0.1; // Small value for persisting themes
  }

  const avgNovelty =
    emergedThemes.reduce((sum, d) => sum + d.theme.noveltyScore, 0) / emergedThemes.length;

  return avgNovelty;
}

/**
 * Calculate the intent score breakdown
 */
export function calculateIntentScore(
  input: IntentInput,
  weights: typeof INTENT_SCORE_WEIGHTS = INTENT_SCORE_WEIGHTS,
): IntentScoreBreakdown {
  const criticality = input.criticalityScore.score / 100;
  const themeNovelty = calculateThemeNovelty(input);
  const instructionalValue = calculateInstructionalValue(input);
  const redundancyPenalty = calculateRedundancyPenalty(input);

  const totalScore =
    weights.criticality * criticality +
    weights.themeNovelty * themeNovelty +
    weights.instructionalValue * instructionalValue -
    weights.redundancyPenalty * redundancyPenalty;

  return {
    criticality,
    themeNovelty,
    instructionalValue,
    redundancyPenalty,
    totalScore: Math.max(0, Math.min(1, totalScore)),
  };
}

/**
 * Extract idea keys from themes for redundancy tracking
 */
export function extractIdeaKeys(themeDeltas: ThemeDelta[]): IdeaKey[] {
  return themeDeltas.map((delta) => ({
    key: delta.theme.themeKey,
    type: 'theme' as const,
    concept: delta.theme.type,
    instance: delta.theme.primarySquare,
    beneficiary: delta.theme.beneficiary,
  }));
}

/**
 * Determine suggested comment length based on intent type and score
 */
export function determineSuggestedLength(
  type: CommentIntentType,
  score: number,
): 'brief' | 'standard' | 'detailed' {
  // Mandatory types get detailed comments
  if (type === 'blunder_explanation' || type === 'critical_moment') {
    return 'detailed';
  }

  // High scoring intents get standard length
  if (score >= 0.6) {
    return 'standard';
  }

  // Tactical shots usually need more explanation
  if (type === 'tactical_shot') {
    return 'standard';
  }

  return 'brief';
}

/**
 * Check if an intent should be mandatory
 */
export function isMandatoryIntent(
  input: IntentInput,
  config: IntentGeneratorConfig = DEFAULT_INTENT_CONFIG,
): boolean {
  // Mandatory for large eval swings
  if (input.evalBefore !== undefined && input.evalAfter !== undefined) {
    const swing = Math.abs(input.evalAfter - input.evalBefore);
    if (swing >= config.mandatoryEvalSwing) {
      return true;
    }
  }

  // Mandatory for critical themes
  for (const delta of input.themeDeltas) {
    if (
      delta.transition === 'emerged' &&
      config.mandatoryThemeSeverities.includes(delta.theme.severity as 'critical' | 'significant')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Create a comment intent from input
 */
export function createCommentIntent(
  input: IntentInput,
  config: IntentGeneratorConfig = DEFAULT_INTENT_CONFIG,
): CommentIntent | null {
  const weights = { ...INTENT_SCORE_WEIGHTS, ...config.weights };
  const scoreBreakdown = calculateIntentScore(input, weights);

  // Check minimum priority
  const mandatory = isMandatoryIntent(input, config);
  if (!mandatory && scoreBreakdown.totalScore < config.minPriority) {
    return null;
  }

  const type = determineIntentType(input);
  const ideaKeys = extractIdeaKeys(input.themeDeltas);
  const suggestedLength = determineSuggestedLength(type, scoreBreakdown.totalScore);

  const content: IntentContent = {
    move: input.move,
    moveNumber: input.moveNumber,
    isWhiteMove: input.isWhiteMove,
    ideaKeys,
  };

  if (input.bestMove !== undefined && input.bestMove !== input.move) {
    content.bestAlternative = input.bestMove;
  }
  if (input.pv !== undefined && input.pv.length > 0) {
    content.variation = input.pv;
  }
  if (input.evalBefore !== undefined) {
    content.evalBefore = input.evalBefore;
  }
  if (input.evalAfter !== undefined) {
    content.evalAfter = input.evalAfter;
  }
  if (input.evalBefore !== undefined && input.evalAfter !== undefined) {
    // Calculate win prob delta (simplified)
    const winProbBefore = 50 + 50 * (2 / (1 + Math.exp(-0.004 * input.evalBefore)) - 1);
    const winProbAfter = 50 + 50 * (2 / (1 + Math.exp(-0.004 * input.evalAfter)) - 1);
    content.winProbDelta = winProbAfter - winProbBefore;
  }

  // Add theme explanation for theme-related intents
  if (type === 'theme_emergence' || type === 'tactical_shot') {
    const emergedThemes = input.themeDeltas.filter((d) => d.transition === 'emerged');
    if (emergedThemes.length > 0) {
      content.themeExplanation = emergedThemes.map((d) => d.theme.explanation).join('; ');
    }
  }

  const intent: CommentIntent = {
    type,
    plyIndex: input.plyIndex,
    priority: scoreBreakdown.totalScore,
    content,
    scoreBreakdown,
    mandatory,
    suggestedLength,
  };

  if (input.themeDeltas.length > 0) {
    intent.themeDeltas = input.themeDeltas;
  }
  if (input.activeThemes.length > 0) {
    intent.activeThemes = input.activeThemes;
  }

  return intent;
}

/**
 * Sort intents by priority (descending)
 */
export function sortIntentsByPriority(intents: CommentIntent[]): CommentIntent[] {
  return [...intents].sort((a, b) => {
    // Mandatory intents first
    if (a.mandatory !== b.mandatory) {
      return a.mandatory ? -1 : 1;
    }
    // Then by priority
    return b.priority - a.priority;
  });
}

/**
 * Get human-readable description for intent type
 */
export function getIntentTypeDescription(type: CommentIntentType): string {
  const descriptions: Record<CommentIntentType, string> = {
    why_this_move: 'Explain why this move is good',
    what_was_missed: 'Explain what better move was missed and why it was superior',
    tactical_shot: 'Highlight tactical opportunity',
    strategic_plan: 'Explain strategic ideas',
    endgame_technique: 'Demonstrate endgame technique',
    human_move: 'Explain practical/human choice',
    theme_emergence: 'New theme has appeared',
    theme_resolution: 'Theme has been resolved',
    critical_moment: 'Game-changing moment',
    blunder_explanation: 'Explain why this move is BAD and what the opponent can exploit',
  };

  return descriptions[type];
}
