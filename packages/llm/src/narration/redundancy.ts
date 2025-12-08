/**
 * Redundancy Detection
 *
 * Detects and handles redundant comment intents to avoid
 * repeating the same ideas within a game or line of analysis.
 */

import type {
  IdeaTracker,
  RedundancyCheck,
  TrackedIdea,
  IdeaTrackerConfig,
} from '../memory/idea-tracker.js';
import { createIdeaTracker, calculateRedundancyPenalty } from '../memory/idea-tracker.js';
import type { IdeaKey } from '../themes/idea-keys.js';
import { generateThemeIdeaKey, IdeaKeySet } from '../themes/idea-keys.js';
import type { ThemeInstance } from '../themes/types.js';

import type { CommentIntent } from './intents.js';

/**
 * Redundancy filter configuration
 */
export interface RedundancyFilterConfig {
  /** Minimum ply gap before re-explaining an idea (default: 15) */
  minPlyGapForReexplain: number;

  /** Maximum redundancy penalty before filtering (default: 0.6) */
  maxRedundancyPenalty: number;

  /** Whether to allow brief references for recent ideas (default: true) */
  allowBriefReferences: boolean;

  /** Decay rate for idea relevance per ply (default: 0.04) */
  relevanceDecayRate: number;
}

/**
 * Default redundancy filter configuration
 */
export const DEFAULT_REDUNDANCY_CONFIG: RedundancyFilterConfig = {
  minPlyGapForReexplain: 15,
  maxRedundancyPenalty: 0.6,
  allowBriefReferences: true,
  relevanceDecayRate: 0.04,
};

/**
 * Result of redundancy filtering
 */
export interface RedundancyFilterResult {
  /** Intents that passed redundancy filter */
  includedIntents: CommentIntent[];

  /** Intents filtered due to redundancy */
  filteredIntents: CommentIntent[];

  /** Reasons for filtering */
  filterReasons: Map<number, RedundancyReason>;

  /** Intents that should use brief references */
  briefReferenceIntents: CommentIntent[];

  /** Statistics */
  stats: {
    totalIntents: number;
    includedCount: number;
    filteredCount: number;
    briefReferenceCount: number;
    averageRedundancyPenalty: number;
  };
}

/**
 * Reason for redundancy filtering
 */
export interface RedundancyReason {
  /** Type of redundancy */
  type: 'recent_explanation' | 'same_line' | 'high_penalty' | 'duplicate_theme';

  /** Description of why filtered */
  description: string;

  /** Previous mention ply if applicable */
  previousPly?: number;

  /** Redundancy score */
  redundancyScore: number;
}

/**
 * Intent redundancy analysis
 */
export interface IntentRedundancyAnalysis {
  /** The analyzed intent */
  intent: CommentIntent;

  /** Overall redundancy score (0 = fresh, 1 = fully redundant) */
  redundancyScore: number;

  /** Individual idea redundancy checks */
  ideaChecks: {
    ideaKey: IdeaKey;
    check: RedundancyCheck;
  }[];

  /** Recommendation */
  recommendation: 'include' | 'brief_reference' | 'skip';

  /** If brief reference, suggested phrasing hint */
  briefReferenceHint?: string;
}

/**
 * Redundancy filter for comment intents
 *
 * Uses the idea tracker to prevent redundant commentary.
 */
export class RedundancyFilter {
  private readonly config: RedundancyFilterConfig;
  private readonly tracker: IdeaTracker;

  constructor(
    config: Partial<RedundancyFilterConfig> = {},
    trackerConfig?: Partial<IdeaTrackerConfig>,
  ) {
    this.config = { ...DEFAULT_REDUNDANCY_CONFIG, ...config };
    this.tracker = createIdeaTracker({
      reexplainThreshold: this.config.minPlyGapForReexplain,
      decayRate: this.config.relevanceDecayRate,
      ...trackerConfig,
    });
  }

  /**
   * Analyze an intent for redundancy
   */
  analyzeIntent(intent: CommentIntent, lineId?: string): IntentRedundancyAnalysis {
    const ideaChecks: { ideaKey: IdeaKey; check: RedundancyCheck }[] = [];

    // Check each idea key in the intent
    for (const ideaKey of intent.content.ideaKeys) {
      const check = this.tracker.checkRedundancy(ideaKey, intent.plyIndex, lineId);
      ideaChecks.push({ ideaKey, check });
    }

    // Check theme-based ideas
    if (intent.themeDeltas !== undefined) {
      for (const delta of intent.themeDeltas) {
        if (delta.transition === 'emerged' || delta.transition === 'escalated') {
          const themeKey = generateThemeIdeaKey(delta.theme);
          const check = this.tracker.checkRedundancy(themeKey, intent.plyIndex, lineId);
          ideaChecks.push({ ideaKey: themeKey, check });
        }
      }
    }

    // Calculate overall redundancy score
    let redundancyScore = 0;
    let briefReferenceCount = 0;

    for (const { check } of ideaChecks) {
      const penalty = calculateRedundancyPenalty(check);
      redundancyScore += penalty;
      if (check.recommendation === 'brief_reference') {
        briefReferenceCount++;
      }
    }

    if (ideaChecks.length > 0) {
      redundancyScore = redundancyScore / ideaChecks.length;
    }

    // Determine recommendation
    let recommendation: 'include' | 'brief_reference' | 'skip';
    let briefReferenceHint: string | undefined;

    if (intent.mandatory) {
      // Mandatory intents always included, but may use brief reference style
      recommendation = redundancyScore > 0.5 ? 'brief_reference' : 'include';
    } else if (redundancyScore >= this.config.maxRedundancyPenalty) {
      recommendation = 'skip';
    } else if (briefReferenceCount > 0 && this.config.allowBriefReferences) {
      recommendation = 'brief_reference';
      briefReferenceHint = this.generateBriefReferenceHint(ideaChecks);
    } else {
      recommendation = 'include';
    }

    const analysis: IntentRedundancyAnalysis = {
      intent,
      redundancyScore,
      ideaChecks,
      recommendation,
    };

    if (briefReferenceHint !== undefined) {
      analysis.briefReferenceHint = briefReferenceHint;
    }

    return analysis;
  }

  /**
   * Filter intents based on redundancy
   */
  filter(intents: CommentIntent[], lineId?: string): RedundancyFilterResult {
    const includedIntents: CommentIntent[] = [];
    const filteredIntents: CommentIntent[] = [];
    const briefReferenceIntents: CommentIntent[] = [];
    const filterReasons = new Map<number, RedundancyReason>();

    let totalPenalty = 0;

    for (const intent of intents) {
      const analysis = this.analyzeIntent(intent, lineId);
      totalPenalty += analysis.redundancyScore;

      switch (analysis.recommendation) {
        case 'include':
          includedIntents.push(intent);
          // Mark ideas as explained
          this.markIntentExplained(intent, lineId);
          break;

        case 'brief_reference':
          briefReferenceIntents.push(intent);
          // Still mark as explained
          this.markIntentExplained(intent, lineId);
          break;

        case 'skip':
          filteredIntents.push(intent);
          filterReasons.set(intent.plyIndex, this.createFilterReason(analysis));
          break;
      }
    }

    return {
      includedIntents,
      filteredIntents,
      briefReferenceIntents,
      filterReasons,
      stats: {
        totalIntents: intents.length,
        includedCount: includedIntents.length,
        filteredCount: filteredIntents.length,
        briefReferenceCount: briefReferenceIntents.length,
        averageRedundancyPenalty: intents.length > 0 ? totalPenalty / intents.length : 0,
      },
    };
  }

  /**
   * Mark an intent's ideas as explained
   */
  markIntentExplained(intent: CommentIntent, lineId?: string): void {
    const scope = lineId !== undefined ? 'line' : 'game';

    // Mark content idea keys
    for (const ideaKey of intent.content.ideaKeys) {
      this.tracker.markExplained(ideaKey, intent.plyIndex, scope, lineId);
    }

    // Mark theme-based ideas
    if (intent.themeDeltas !== undefined) {
      for (const delta of intent.themeDeltas) {
        if (delta.transition === 'emerged' || delta.transition === 'escalated') {
          const themeKey = generateThemeIdeaKey(delta.theme);
          this.tracker.markExplained(themeKey, intent.plyIndex, scope, lineId);
        }
      }
    }
  }

  /**
   * Check if a specific theme has been explained
   */
  isThemeExplained(theme: ThemeInstance, lineId?: string): boolean {
    const themeKey = generateThemeIdeaKey(theme);
    if (lineId !== undefined) {
      return this.tracker.wasExplainedInLine(themeKey, lineId);
    }
    return this.tracker.wasExplained(themeKey);
  }

  /**
   * Get ideas explained in a specific line
   */
  getExplainedIdeasInLine(lineId: string): TrackedIdea[] {
    return this.tracker.getLineIdeas(lineId);
  }

  /**
   * Get all game-wide explained ideas
   */
  getGameExplainedIdeas(): TrackedIdea[] {
    return this.tracker.getGameIdeas();
  }

  /**
   * Update relevance decay based on current ply
   */
  updateDecay(currentPly: number): void {
    this.tracker.decayRelevance(currentPly);
  }

  /**
   * Copy line ideas to a new branching line
   */
  copyLineIdeas(sourceLineId: string, targetLineId: string): void {
    this.tracker.copyLineIdeas(sourceLineId, targetLineId);
  }

  /**
   * Clear all tracked ideas (reset state)
   */
  reset(): void {
    this.tracker.clear();
  }

  /**
   * Get statistics about tracked ideas
   */
  getStats(): {
    gameIdeasCount: number;
    lineCount: number;
    totalLineIdeas: number;
    averageRelevance: number;
  } {
    return this.tracker.getStats();
  }

  /**
   * Export state for serialization
   */
  export(): {
    gameIdeas: TrackedIdea[];
    lineIdeas: Record<string, TrackedIdea[]>;
  } {
    return this.tracker.export();
  }

  /**
   * Import state from serialization
   */
  import(data: { gameIdeas: TrackedIdea[]; lineIdeas: Record<string, TrackedIdea[]> }): void {
    this.tracker.import(data);
  }

  /**
   * Generate a hint for brief reference phrasing
   */
  private generateBriefReferenceHint(
    ideaChecks: { ideaKey: IdeaKey; check: RedundancyCheck }[],
  ): string {
    const recentIdeas = ideaChecks.filter(
      (ic) => ic.check.recommendation === 'brief_reference' && ic.check.previousMention,
    );

    if (recentIdeas.length === 0) {
      return 'Reference briefly without full explanation';
    }

    const mostRecent = recentIdeas.reduce((a, b) =>
      (a.check.previousMention?.ply ?? 0) > (b.check.previousMention?.ply ?? 0) ? a : b,
    );

    const plyDistance =
      mostRecent.check.previousMention !== undefined
        ? `${mostRecent.check.previousMention.ply} plies ago`
        : 'recently';

    return `Reference ${mostRecent.ideaKey.concept} (mentioned ${plyDistance})`;
  }

  /**
   * Create a filter reason from analysis
   */
  private createFilterReason(analysis: IntentRedundancyAnalysis): RedundancyReason {
    // Find the most significant redundancy
    const redundantChecks = analysis.ideaChecks.filter((ic) => ic.check.isRedundant);

    if (redundantChecks.length === 0) {
      return {
        type: 'high_penalty',
        description: 'Cumulative redundancy penalty too high',
        redundancyScore: analysis.redundancyScore,
      };
    }

    const mostRecent = redundantChecks.reduce((a, b) =>
      (a.check.previousMention?.ply ?? 0) > (b.check.previousMention?.ply ?? 0) ? a : b,
    );

    const reason: RedundancyReason = {
      type: 'recent_explanation',
      description: mostRecent.check.reason ?? `${mostRecent.ideaKey.concept} recently explained`,
      redundancyScore: analysis.redundancyScore,
    };

    if (mostRecent.check.previousMention !== undefined) {
      reason.previousPly = mostRecent.check.previousMention.ply;
    }

    return reason;
  }
}

/**
 * Create a redundancy filter
 */
export function createRedundancyFilter(
  config?: Partial<RedundancyFilterConfig>,
  trackerConfig?: Partial<IdeaTrackerConfig>,
): RedundancyFilter {
  return new RedundancyFilter(config, trackerConfig);
}

/**
 * Quick redundancy check for a single idea key
 */
export function isIdeaRedundant(
  ideaKey: IdeaKey,
  _currentPly: number,
  explainedKeys: IdeaKeySet,
  _config: RedundancyFilterConfig = DEFAULT_REDUNDANCY_CONFIG,
): boolean {
  // Simple check based on whether the key exists
  // For more sophisticated checking, use RedundancyFilter class
  return explainedKeys.has(ideaKey);
}

/**
 * Calculate redundancy score for multiple idea keys
 */
export function calculateBatchRedundancy(
  ideaKeys: IdeaKey[],
  currentPly: number,
  tracker: IdeaTracker,
  lineId?: string,
): number {
  if (ideaKeys.length === 0) return 0;

  let totalPenalty = 0;
  for (const ideaKey of ideaKeys) {
    const check = tracker.checkRedundancy(ideaKey, currentPly, lineId);
    totalPenalty += calculateRedundancyPenalty(check);
  }

  return totalPenalty / ideaKeys.length;
}

/**
 * Find the freshest (least redundant) ideas from a set
 */
export function findFreshestIdeas(
  ideaKeys: IdeaKey[],
  currentPly: number,
  tracker: IdeaTracker,
  maxCount: number,
  lineId?: string,
): IdeaKey[] {
  const analyzed = ideaKeys.map((ideaKey) => ({
    ideaKey,
    check: tracker.checkRedundancy(ideaKey, currentPly, lineId),
    penalty: calculateRedundancyPenalty(tracker.checkRedundancy(ideaKey, currentPly, lineId)),
  }));

  // Sort by penalty ascending (freshest first)
  analyzed.sort((a, b) => a.penalty - b.penalty);

  return analyzed.slice(0, maxCount).map((a) => a.ideaKey);
}

/**
 * Merge redundancy results from multiple sources
 */
export function mergeRedundancyResults(results: RedundancyFilterResult[]): RedundancyFilterResult {
  const merged: RedundancyFilterResult = {
    includedIntents: [],
    filteredIntents: [],
    briefReferenceIntents: [],
    filterReasons: new Map(),
    stats: {
      totalIntents: 0,
      includedCount: 0,
      filteredCount: 0,
      briefReferenceCount: 0,
      averageRedundancyPenalty: 0,
    },
  };

  let totalPenalty = 0;
  let totalIntents = 0;

  for (const result of results) {
    merged.includedIntents.push(...result.includedIntents);
    merged.filteredIntents.push(...result.filteredIntents);
    merged.briefReferenceIntents.push(...result.briefReferenceIntents);

    for (const [ply, reason] of result.filterReasons) {
      merged.filterReasons.set(ply, reason);
    }

    totalPenalty += result.stats.averageRedundancyPenalty * result.stats.totalIntents;
    totalIntents += result.stats.totalIntents;
  }

  merged.stats = {
    totalIntents,
    includedCount: merged.includedIntents.length,
    filteredCount: merged.filteredIntents.length,
    briefReferenceCount: merged.briefReferenceIntents.length,
    averageRedundancyPenalty: totalIntents > 0 ? totalPenalty / totalIntents : 0,
  };

  return merged;
}
