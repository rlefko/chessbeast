/**
 * Comment Density Control
 *
 * Manages the density of comments in annotated games to avoid
 * overwhelming the reader while ensuring important moments are covered.
 */

import type { CommentIntent } from './intents.js';

/**
 * Density level configuration
 */
export type DensityLevel = 'sparse' | 'normal' | 'verbose';

/**
 * Density configuration options
 */
export interface DensityConfig {
  /** Maximum comments per window of plies */
  maxCommentsPerWindow: number;

  /** Size of the sliding window in plies */
  windowSize: number;

  /** Minimum plies between comments (unless mandatory) */
  minPlyGap: number;

  /** Priority threshold for guaranteed inclusion */
  guaranteedPriorityThreshold: number;

  /** Whether to allow consecutive comments */
  allowConsecutive: boolean;

  /** Maximum total comments as percentage of game length */
  maxCommentRatio: number;
}

/**
 * Predefined density configurations
 */
export const DENSITY_CONFIGS: Record<DensityLevel, DensityConfig> = {
  sparse: {
    maxCommentsPerWindow: 1,
    windowSize: 5,
    minPlyGap: 4,
    guaranteedPriorityThreshold: 0.8,
    allowConsecutive: false,
    maxCommentRatio: 0.15,
  },
  normal: {
    maxCommentsPerWindow: 2,
    windowSize: 3,
    minPlyGap: 2,
    guaranteedPriorityThreshold: 0.7,
    allowConsecutive: false,
    maxCommentRatio: 0.25,
  },
  verbose: {
    maxCommentsPerWindow: 3,
    windowSize: 3,
    minPlyGap: 1,
    guaranteedPriorityThreshold: 0.5,
    allowConsecutive: true,
    maxCommentRatio: 0.4,
  },
};

/**
 * Result of density filtering
 */
export interface DensityFilterResult {
  /** Intents that passed the density filter */
  includedIntents: CommentIntent[];

  /** Intents that were filtered out */
  filteredIntents: CommentIntent[];

  /** Reason each filtered intent was excluded */
  filterReasons: Map<number, string>;

  /** Statistics about the filtering */
  stats: {
    totalIntents: number;
    includedCount: number;
    filteredCount: number;
    mandatoryCount: number;
    densityViolations: number;
  };
}

/**
 * Density filter for comment intents
 */
export class DensityFilter {
  private readonly config: DensityConfig;

  constructor(level: DensityLevel | DensityConfig = 'normal') {
    this.config = typeof level === 'string' ? DENSITY_CONFIGS[level] : level;
  }

  /**
   * Filter intents based on density rules
   *
   * @param intents - All comment intents (should be sorted by priority)
   * @param totalPlies - Total number of plies in the game
   * @returns Filtered intents and statistics
   */
  filter(intents: CommentIntent[], totalPlies: number): DensityFilterResult {
    const includedIntents: CommentIntent[] = [];
    const filteredIntents: CommentIntent[] = [];
    const filterReasons = new Map<number, string>();
    let densityViolations = 0;
    let mandatoryCount = 0;

    // Calculate maximum comments allowed
    const maxComments = Math.floor(totalPlies * this.config.maxCommentRatio);

    // Track which plies have comments
    const commentedPlies = new Set<number>();

    // Process intents in priority order
    for (const intent of intents) {
      // Always include mandatory intents
      if (intent.mandatory) {
        includedIntents.push(intent);
        commentedPlies.add(intent.plyIndex);
        mandatoryCount++;
        continue;
      }

      // Check max comments limit
      if (includedIntents.length >= maxComments) {
        filteredIntents.push(intent);
        filterReasons.set(intent.plyIndex, 'max comments reached');
        continue;
      }

      // Check window density
      const windowViolation = this.checkWindowDensity(intent.plyIndex, commentedPlies);
      if (windowViolation) {
        filteredIntents.push(intent);
        filterReasons.set(intent.plyIndex, windowViolation);
        densityViolations++;
        continue;
      }

      // Check minimum gap
      const gapViolation = this.checkMinimumGap(intent.plyIndex, commentedPlies);
      if (gapViolation && intent.priority < this.config.guaranteedPriorityThreshold) {
        filteredIntents.push(intent);
        filterReasons.set(intent.plyIndex, gapViolation);
        densityViolations++;
        continue;
      }

      // Include the intent
      includedIntents.push(intent);
      commentedPlies.add(intent.plyIndex);
    }

    // Sort included intents by ply order for output
    includedIntents.sort((a, b) => a.plyIndex - b.plyIndex);

    return {
      includedIntents,
      filteredIntents,
      filterReasons,
      stats: {
        totalIntents: intents.length,
        includedCount: includedIntents.length,
        filteredCount: filteredIntents.length,
        mandatoryCount,
        densityViolations,
      },
    };
  }

  /**
   * Check if adding a comment at this ply violates window density
   */
  private checkWindowDensity(ply: number, commentedPlies: Set<number>): string | null {
    const windowStart = Math.max(0, ply - this.config.windowSize + 1);
    const windowEnd = ply;

    let commentsInWindow = 0;
    for (let i = windowStart; i <= windowEnd; i++) {
      if (commentedPlies.has(i)) {
        commentsInWindow++;
      }
    }

    if (commentsInWindow >= this.config.maxCommentsPerWindow) {
      return `window density exceeded (${commentsInWindow}/${this.config.maxCommentsPerWindow})`;
    }

    return null;
  }

  /**
   * Check if adding a comment at this ply violates minimum gap
   */
  private checkMinimumGap(ply: number, commentedPlies: Set<number>): string | null {
    // Check for consecutive comments
    if (!this.config.allowConsecutive) {
      if (commentedPlies.has(ply - 1) || commentedPlies.has(ply + 1)) {
        return 'consecutive comments not allowed';
      }
    }

    // Check minimum gap
    for (let i = 1; i < this.config.minPlyGap; i++) {
      if (commentedPlies.has(ply - i) || commentedPlies.has(ply + i)) {
        return `minimum gap (${this.config.minPlyGap}) not met`;
      }
    }

    return null;
  }

  /**
   * Get the current configuration
   */
  getConfig(): DensityConfig {
    return { ...this.config };
  }
}

/**
 * Create a density filter with the specified level
 */
export function createDensityFilter(level: DensityLevel | DensityConfig = 'normal'): DensityFilter {
  return new DensityFilter(level);
}

/**
 * Calculate the ideal comment positions for a game
 *
 * This distributes comments evenly while respecting density rules.
 *
 * @param totalPlies - Total number of plies in the game
 * @param desiredComments - Desired number of comments
 * @param config - Density configuration
 * @returns Array of ideal ply positions for comments
 */
export function calculateIdealPositions(
  totalPlies: number,
  desiredComments: number,
  config: DensityConfig = DENSITY_CONFIGS.normal,
): number[] {
  const maxComments = Math.min(desiredComments, Math.floor(totalPlies * config.maxCommentRatio));

  if (maxComments <= 0) return [];

  const positions: number[] = [];
  const spacing = totalPlies / (maxComments + 1);

  for (let i = 1; i <= maxComments; i++) {
    const idealPly = Math.round(spacing * i);
    positions.push(Math.min(idealPly, totalPlies - 1));
  }

  return positions;
}

/**
 * Compress adjacent comments into a single umbrella comment
 *
 * When multiple comments would appear close together, this can
 * combine them into a single more comprehensive comment.
 *
 * @param intents - Intents to potentially compress
 * @param maxGap - Maximum ply gap to consider for compression
 * @returns Compressed intent groups
 */
export function compressAdjacentIntents(
  intents: CommentIntent[],
  maxGap: number = 2,
): CommentIntent[][] {
  if (intents.length === 0) return [];

  // Sort by ply
  const sorted = [...intents].sort((a, b) => a.plyIndex - b.plyIndex);

  const groups: CommentIntent[][] = [];
  let currentGroup: CommentIntent[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const previous = sorted[i - 1]!;

    if (current.plyIndex - previous.plyIndex <= maxGap) {
      // Add to current group
      currentGroup.push(current);
    } else {
      // Start new group
      groups.push(currentGroup);
      currentGroup = [current];
    }
  }

  // Don't forget the last group
  groups.push(currentGroup);

  return groups;
}

/**
 * Select representative intent from a group
 *
 * When compressing intents, select the best one to represent the group.
 *
 * @param group - Group of adjacent intents
 * @returns The selected representative intent
 */
export function selectRepresentativeIntent(group: CommentIntent[]): CommentIntent {
  if (group.length === 1) {
    return group[0]!;
  }

  // Prefer mandatory intents
  const mandatory = group.filter((i) => i.mandatory);
  if (mandatory.length > 0) {
    return mandatory.reduce((best, current) => (current.priority > best.priority ? current : best));
  }

  // Otherwise, highest priority
  return group.reduce((best, current) => (current.priority > best.priority ? current : best));
}

/**
 * Check if a position should always receive a comment
 *
 * Some positions are so important they should bypass density rules.
 *
 * @param intent - The comment intent to check
 * @returns Whether this should bypass density rules
 */
export function shouldBypassDensity(intent: CommentIntent): boolean {
  // Mandatory intents always bypass
  if (intent.mandatory) {
    return true;
  }

  // Very high priority intents
  if (intent.priority >= 0.85) {
    return true;
  }

  // Blunder explanations
  if (intent.type === 'blunder_explanation') {
    return true;
  }

  // Critical moments with high score
  if (intent.type === 'critical_moment' && intent.priority >= 0.7) {
    return true;
  }

  return false;
}

/**
 * Get density recommendation based on game length
 *
 * @param totalPlies - Total number of plies in the game
 * @returns Recommended density level
 */
export function recommendDensityLevel(totalPlies: number): DensityLevel {
  // Short games benefit from more detailed annotation
  if (totalPlies < 40) {
    return 'verbose';
  }

  // Very long games need sparser annotation
  if (totalPlies > 120) {
    return 'sparse';
  }

  return 'normal';
}
