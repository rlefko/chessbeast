/**
 * Idea Tracker
 *
 * Tracks explained ideas across the analysis to prevent redundancy.
 * Supports different scopes (game-wide vs line-specific) and
 * decay mechanisms for idea relevance.
 */

import type { IdeaKey } from '../themes/idea-keys.js';
import { IdeaKeySet, createIdeaKeySet } from '../themes/idea-keys.js';

/**
 * Scope at which an idea was explained
 */
export type IdeaScope = 'game' | 'line' | 'variation';

/**
 * Entry for a tracked idea
 */
export interface TrackedIdea {
  /** The idea key */
  ideaKey: IdeaKey;

  /** Ply when this idea was first explained */
  firstExplainedPly: number;

  /** Ply when this idea was last mentioned */
  lastMentionedPly: number;

  /** Number of times this idea has been explained */
  mentionCount: number;

  /** Scope at which this was explained */
  scope: IdeaScope;

  /** Relevance score (decays over time) */
  relevanceScore: number;
}

/**
 * Configuration for the idea tracker
 */
export interface IdeaTrackerConfig {
  /** Ply distance after which ideas can be re-explained (default: 20) */
  reexplainThreshold: number;

  /** Relevance decay rate per ply (default: 0.05) */
  decayRate: number;

  /** Minimum relevance to consider idea as "explained" (default: 0.3) */
  minRelevance: number;

  /** Maximum ideas to track per scope (default: 100) */
  maxIdeasPerScope: number;
}

/**
 * Default idea tracker configuration
 */
export const DEFAULT_IDEA_TRACKER_CONFIG: IdeaTrackerConfig = {
  reexplainThreshold: 20,
  decayRate: 0.05,
  minRelevance: 0.3,
  maxIdeasPerScope: 100,
};

/**
 * Redundancy check result
 */
export interface RedundancyCheck {
  /** Whether the idea is redundant (already explained recently) */
  isRedundant: boolean;

  /** Reason for redundancy (if redundant) */
  reason?: string;

  /** Previous mention info (if found) */
  previousMention?: {
    ply: number;
    count: number;
    relevance: number;
  };

  /** Recommended action */
  recommendation: 'skip' | 'brief_reference' | 'full_explanation';
}

/**
 * Idea Tracker
 *
 * Manages tracking of explained ideas across different scopes
 * to prevent redundant commentary.
 */
export class IdeaTracker {
  private readonly config: IdeaTrackerConfig;

  /** Game-wide explained ideas (keyed by idea key string) */
  private gameIdeas: Map<string, TrackedIdea>;

  /** Line-specific explained ideas (keyed by line ID, then idea key string) */
  private lineIdeas: Map<string, Map<string, TrackedIdea>>;

  /** Quick lookup sets for fast checks */
  private gameIdeaSet: IdeaKeySet;

  constructor(config: Partial<IdeaTrackerConfig> = {}) {
    this.config = { ...DEFAULT_IDEA_TRACKER_CONFIG, ...config };
    this.gameIdeas = new Map();
    this.lineIdeas = new Map();
    this.gameIdeaSet = createIdeaKeySet();
  }

  /**
   * Mark an idea as explained
   */
  markExplained(ideaKey: IdeaKey, ply: number, scope: IdeaScope, lineId?: string): void {
    if (scope === 'game') {
      this.markGameIdea(ideaKey, ply);
    } else if (scope === 'line' && lineId) {
      this.markLineIdea(ideaKey, ply, lineId);
    }
  }

  /**
   * Mark a game-wide idea as explained
   */
  private markGameIdea(ideaKey: IdeaKey, ply: number): void {
    const existing = this.gameIdeas.get(ideaKey.key);

    if (existing) {
      existing.lastMentionedPly = ply;
      existing.mentionCount++;
      existing.relevanceScore = 1.0; // Reset relevance
    } else {
      this.gameIdeas.set(ideaKey.key, {
        ideaKey,
        firstExplainedPly: ply,
        lastMentionedPly: ply,
        mentionCount: 1,
        scope: 'game',
        relevanceScore: 1.0,
      });
      this.gameIdeaSet.add(ideaKey);

      // Prune if too many
      this.pruneGameIdeas();
    }
  }

  /**
   * Mark a line-specific idea as explained
   */
  private markLineIdea(ideaKey: IdeaKey, ply: number, lineId: string): void {
    let lineMap = this.lineIdeas.get(lineId);
    if (!lineMap) {
      lineMap = new Map();
      this.lineIdeas.set(lineId, lineMap);
    }

    const existing = lineMap.get(ideaKey.key);

    if (existing) {
      existing.lastMentionedPly = ply;
      existing.mentionCount++;
      existing.relevanceScore = 1.0;
    } else {
      lineMap.set(ideaKey.key, {
        ideaKey,
        firstExplainedPly: ply,
        lastMentionedPly: ply,
        mentionCount: 1,
        scope: 'line',
        relevanceScore: 1.0,
      });

      // Prune if too many
      this.pruneLineIdeas(lineId);
    }
  }

  /**
   * Check if an idea is redundant at the current position
   */
  checkRedundancy(ideaKey: IdeaKey, currentPly: number, lineId?: string): RedundancyCheck {
    // Check line-specific first (higher priority)
    if (lineId) {
      const lineCheck = this.checkLineRedundancy(ideaKey, currentPly, lineId);
      if (lineCheck.isRedundant) {
        return lineCheck;
      }
    }

    // Check game-wide
    return this.checkGameRedundancy(ideaKey, currentPly);
  }

  /**
   * Check game-wide redundancy
   */
  private checkGameRedundancy(ideaKey: IdeaKey, currentPly: number): RedundancyCheck {
    const idea = this.gameIdeas.get(ideaKey.key);

    if (!idea) {
      return {
        isRedundant: false,
        recommendation: 'full_explanation',
      };
    }

    // Calculate decayed relevance
    const plyDistance = currentPly - idea.lastMentionedPly;
    const decayedRelevance = idea.relevanceScore * Math.pow(1 - this.config.decayRate, plyDistance);

    // Check if still relevant
    if (decayedRelevance < this.config.minRelevance) {
      return {
        isRedundant: false,
        previousMention: {
          ply: idea.lastMentionedPly,
          count: idea.mentionCount,
          relevance: decayedRelevance,
        },
        recommendation: 'full_explanation',
      };
    }

    // Check ply distance
    if (plyDistance >= this.config.reexplainThreshold) {
      return {
        isRedundant: false,
        previousMention: {
          ply: idea.lastMentionedPly,
          count: idea.mentionCount,
          relevance: decayedRelevance,
        },
        recommendation: 'brief_reference',
      };
    }

    // Redundant
    return {
      isRedundant: true,
      reason: `Explained ${plyDistance} plies ago (ply ${idea.lastMentionedPly})`,
      previousMention: {
        ply: idea.lastMentionedPly,
        count: idea.mentionCount,
        relevance: decayedRelevance,
      },
      recommendation: 'skip',
    };
  }

  /**
   * Check line-specific redundancy
   */
  private checkLineRedundancy(
    ideaKey: IdeaKey,
    currentPly: number,
    lineId: string,
  ): RedundancyCheck {
    const lineMap = this.lineIdeas.get(lineId);
    if (!lineMap) {
      return {
        isRedundant: false,
        recommendation: 'full_explanation',
      };
    }

    const idea = lineMap.get(ideaKey.key);
    if (!idea) {
      return {
        isRedundant: false,
        recommendation: 'full_explanation',
      };
    }

    const plyDistance = currentPly - idea.lastMentionedPly;
    const decayedRelevance = idea.relevanceScore * Math.pow(1 - this.config.decayRate, plyDistance);

    if (decayedRelevance < this.config.minRelevance) {
      return {
        isRedundant: false,
        previousMention: {
          ply: idea.lastMentionedPly,
          count: idea.mentionCount,
          relevance: decayedRelevance,
        },
        recommendation: 'full_explanation',
      };
    }

    // Lines have stricter redundancy (no re-explain threshold)
    return {
      isRedundant: true,
      reason: `Already explained in this line at ply ${idea.lastMentionedPly}`,
      previousMention: {
        ply: idea.lastMentionedPly,
        count: idea.mentionCount,
        relevance: decayedRelevance,
      },
      recommendation: 'skip',
    };
  }

  /**
   * Quick check if idea was ever explained (game-wide)
   */
  wasExplained(ideaKey: IdeaKey): boolean {
    return this.gameIdeaSet.has(ideaKey);
  }

  /**
   * Quick check if idea was explained in a specific line
   */
  wasExplainedInLine(ideaKey: IdeaKey, lineId: string): boolean {
    const lineMap = this.lineIdeas.get(lineId);
    return lineMap?.has(ideaKey.key) ?? false;
  }

  /**
   * Get all explained ideas for a line
   */
  getLineIdeas(lineId: string): TrackedIdea[] {
    const lineMap = this.lineIdeas.get(lineId);
    if (!lineMap) return [];
    return Array.from(lineMap.values());
  }

  /**
   * Get all game-wide explained ideas
   */
  getGameIdeas(): TrackedIdea[] {
    return Array.from(this.gameIdeas.values());
  }

  /**
   * Decay all relevance scores based on ply distance
   */
  decayRelevance(currentPly: number): void {
    // Decay game ideas
    for (const idea of this.gameIdeas.values()) {
      const plyDistance = currentPly - idea.lastMentionedPly;
      idea.relevanceScore = Math.pow(1 - this.config.decayRate, plyDistance);
    }

    // Decay line ideas
    for (const lineMap of this.lineIdeas.values()) {
      for (const idea of lineMap.values()) {
        const plyDistance = currentPly - idea.lastMentionedPly;
        idea.relevanceScore = Math.pow(1 - this.config.decayRate, plyDistance);
      }
    }
  }

  /**
   * Prune game ideas to max limit
   */
  private pruneGameIdeas(): void {
    if (this.gameIdeas.size <= this.config.maxIdeasPerScope) return;

    // Sort by relevance (lowest first)
    const sorted = Array.from(this.gameIdeas.entries()).sort(
      (a, b) => a[1].relevanceScore - b[1].relevanceScore,
    );

    // Remove lowest relevance ideas
    const toRemove = sorted.slice(0, sorted.length - this.config.maxIdeasPerScope);
    for (const [key, idea] of toRemove) {
      this.gameIdeas.delete(key);
      this.gameIdeaSet.delete(idea.ideaKey);
    }
  }

  /**
   * Prune line ideas to max limit
   */
  private pruneLineIdeas(lineId: string): void {
    const lineMap = this.lineIdeas.get(lineId);
    if (!lineMap || lineMap.size <= this.config.maxIdeasPerScope) return;

    const sorted = Array.from(lineMap.entries()).sort(
      (a, b) => a[1].relevanceScore - b[1].relevanceScore,
    );

    const toRemove = sorted.slice(0, sorted.length - this.config.maxIdeasPerScope);
    for (const [key] of toRemove) {
      lineMap.delete(key);
    }
  }

  /**
   * Clear all tracked ideas
   */
  clear(): void {
    this.gameIdeas.clear();
    this.lineIdeas.clear();
    this.gameIdeaSet = createIdeaKeySet();
  }

  /**
   * Clear ideas for a specific line
   */
  clearLine(lineId: string): void {
    this.lineIdeas.delete(lineId);
  }

  /**
   * Copy line ideas to a new line (for branching)
   */
  copyLineIdeas(sourceLineId: string, targetLineId: string): void {
    const sourceMap = this.lineIdeas.get(sourceLineId);
    if (!sourceMap) return;

    const targetMap = new Map<string, TrackedIdea>();
    for (const [key, idea] of sourceMap) {
      targetMap.set(key, { ...idea });
    }
    this.lineIdeas.set(targetLineId, targetMap);
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
    let totalLineIdeas = 0;
    let totalRelevance = 0;
    let count = 0;

    for (const idea of this.gameIdeas.values()) {
      totalRelevance += idea.relevanceScore;
      count++;
    }

    for (const lineMap of this.lineIdeas.values()) {
      totalLineIdeas += lineMap.size;
      for (const idea of lineMap.values()) {
        totalRelevance += idea.relevanceScore;
        count++;
      }
    }

    return {
      gameIdeasCount: this.gameIdeas.size,
      lineCount: this.lineIdeas.size,
      totalLineIdeas,
      averageRelevance: count > 0 ? totalRelevance / count : 0,
    };
  }

  /**
   * Export tracker state for serialization
   */
  export(): {
    gameIdeas: TrackedIdea[];
    lineIdeas: Record<string, TrackedIdea[]>;
  } {
    const lineIdeas: Record<string, TrackedIdea[]> = {};
    for (const [lineId, lineMap] of this.lineIdeas) {
      lineIdeas[lineId] = Array.from(lineMap.values());
    }

    return {
      gameIdeas: Array.from(this.gameIdeas.values()),
      lineIdeas,
    };
  }

  /**
   * Import tracker state from serialization
   */
  import(data: { gameIdeas: TrackedIdea[]; lineIdeas: Record<string, TrackedIdea[]> }): void {
    this.clear();

    for (const idea of data.gameIdeas) {
      this.gameIdeas.set(idea.ideaKey.key, idea);
      this.gameIdeaSet.add(idea.ideaKey);
    }

    for (const [lineId, ideas] of Object.entries(data.lineIdeas)) {
      const lineMap = new Map<string, TrackedIdea>();
      for (const idea of ideas) {
        lineMap.set(idea.ideaKey.key, idea);
      }
      this.lineIdeas.set(lineId, lineMap);
    }
  }
}

/**
 * Create a new idea tracker
 */
export function createIdeaTracker(config?: Partial<IdeaTrackerConfig>): IdeaTracker {
  return new IdeaTracker(config);
}

/**
 * Calculate redundancy penalty for scoring
 *
 * Returns a value between 0 and 1 where:
 * - 0 = no redundancy (idea is fresh)
 * - 1 = fully redundant (skip this idea)
 */
export function calculateRedundancyPenalty(check: RedundancyCheck): number {
  if (!check.isRedundant) {
    if (check.recommendation === 'brief_reference') {
      return 0.3; // Mild penalty for brief reference
    }
    return 0; // No penalty for full explanation
  }

  // Full penalty for redundant ideas
  return check.previousMention?.relevance ?? 1.0;
}
