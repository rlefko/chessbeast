/**
 * Theme Lifecycle Tracker
 *
 * Tracks how themes evolve across positions, detecting when themes
 * emerge, persist, escalate, resolve, or transform.
 */

import type { ThemeSeverity } from '@chessbeast/core/storage';

import type { ThemeInstance, ThemeDelta, ThemeStatus } from './types.js';
import { createThemeDelta, calculateNoveltyScore } from './types.js';

/**
 * Lifecycle tracker configuration
 */
export interface LifecycleTrackerConfig {
  /** How quickly novelty decays (default: 0.15 per ply) */
  noveltyDecayRate: number;

  /** Minimum severity change to count as escalation */
  escalationThreshold: number;
}

/**
 * Default lifecycle tracker configuration
 */
export const DEFAULT_LIFECYCLE_CONFIG: LifecycleTrackerConfig = {
  noveltyDecayRate: 0.15,
  escalationThreshold: 1,
};

/**
 * Theme lifecycle tracker
 *
 * Tracks themes across positions to detect:
 * - Emerged: New theme appeared
 * - Persisting: Theme continues from previous position
 * - Escalated: Theme severity increased
 * - Resolved: Theme no longer present
 * - Transformed: Theme changed form
 */
export class ThemeLifecycleTracker {
  private readonly config: LifecycleTrackerConfig;

  /** Themes from the previous position, keyed by themeKey */
  private previousThemes: Map<string, ThemeInstance> = new Map();

  /** Current ply */
  private currentPly: number = 0;

  constructor(config: Partial<LifecycleTrackerConfig> = {}) {
    this.config = { ...DEFAULT_LIFECYCLE_CONFIG, ...config };
  }

  /**
   * Process new themes and compute lifecycle deltas
   *
   * @param newThemes - Themes detected in the current position
   * @param ply - Current ply number
   * @returns Updated themes with lifecycle status and deltas
   */
  processThemes(
    newThemes: ThemeInstance[],
    ply: number,
  ): { themes: ThemeInstance[]; deltas: ThemeDelta[] } {
    this.currentPly = ply;
    const deltas: ThemeDelta[] = [];
    const processedThemes: ThemeInstance[] = [];
    const newThemeKeys = new Set<string>();

    // Process each new theme
    for (const theme of newThemes) {
      newThemeKeys.add(theme.themeKey);
      const previousTheme = this.previousThemes.get(theme.themeKey);

      if (previousTheme) {
        // Theme existed before - check for changes
        const { updatedTheme, delta } = this.processExistingTheme(theme, previousTheme);
        processedThemes.push(updatedTheme);
        if (delta) {
          deltas.push(delta);
        }
      } else {
        // New theme - mark as emerged
        const emergedTheme = this.markAsEmerged(theme);
        processedThemes.push(emergedTheme);
        deltas.push(
          createThemeDelta(emergedTheme, 'emerged', {
            changeDescription: `${theme.type} emerged on ${theme.primarySquare}`,
          }),
        );
      }
    }

    // Check for resolved themes (were in previous but not in new)
    for (const [key, previousTheme] of this.previousThemes) {
      if (!newThemeKeys.has(key)) {
        const resolvedTheme = this.markAsResolved(previousTheme);
        deltas.push(
          createThemeDelta(resolvedTheme, 'resolved', {
            previousStatus: previousTheme.status,
            changeDescription: `${previousTheme.type} resolved`,
          }),
        );
      }
    }

    // Update previous themes for next call
    this.previousThemes = new Map(processedThemes.map((t) => [t.themeKey, t]));

    return { themes: processedThemes, deltas };
  }

  /**
   * Process a theme that existed in the previous position
   */
  private processExistingTheme(
    newTheme: ThemeInstance,
    previousTheme: ThemeInstance,
  ): { updatedTheme: ThemeInstance; delta: ThemeDelta | null } {
    const severityChange = this.compareSeverity(newTheme.severity, previousTheme.severity);

    let status: ThemeStatus = 'persisting';
    let delta: ThemeDelta | null = null;

    if (severityChange > 0) {
      // Theme escalated
      status = 'escalated';
      delta = createThemeDelta(newTheme, 'escalated', {
        previousStatus: previousTheme.status,
        previousSeverity: previousTheme.severity,
        changeDescription: `${newTheme.type} escalated from ${previousTheme.severity} to ${newTheme.severity}`,
      });
    } else if (this.hasTransformed(newTheme, previousTheme)) {
      // Theme transformed
      status = 'transformed';
      delta = createThemeDelta(newTheme, 'transformed', {
        previousStatus: previousTheme.status,
        changeDescription: `${newTheme.type} transformed`,
      });
    }

    const updatedTheme: ThemeInstance = {
      ...newTheme,
      firstSeenPly: previousTheme.firstSeenPly,
      lastSeenPly: this.currentPly,
      status,
      noveltyScore: calculateNoveltyScore(
        previousTheme.firstSeenPly,
        this.currentPly,
        this.config.noveltyDecayRate,
      ),
    };

    return { updatedTheme, delta };
  }

  /**
   * Mark a theme as newly emerged
   */
  private markAsEmerged(theme: ThemeInstance): ThemeInstance {
    return {
      ...theme,
      firstSeenPly: this.currentPly,
      lastSeenPly: this.currentPly,
      status: 'emerged',
      noveltyScore: 1.0,
    };
  }

  /**
   * Mark a theme as resolved
   */
  private markAsResolved(theme: ThemeInstance): ThemeInstance {
    return {
      ...theme,
      lastSeenPly: this.currentPly,
      status: 'resolved',
      noveltyScore: 0,
    };
  }

  /**
   * Compare severity levels
   * Returns positive if new is more severe, negative if less, 0 if equal
   */
  private compareSeverity(newSeverity: ThemeSeverity, oldSeverity: ThemeSeverity): number {
    const order: Record<ThemeSeverity, number> = {
      minor: 0,
      moderate: 1,
      significant: 2,
      critical: 3,
    };
    return (order[newSeverity] ?? 0) - (order[oldSeverity] ?? 0);
  }

  /**
   * Check if a theme has transformed
   *
   * A theme transforms when its essential characteristics change
   * while maintaining the same identity.
   */
  private hasTransformed(newTheme: ThemeInstance, previousTheme: ThemeInstance): boolean {
    // Primary square changed significantly
    if (newTheme.primarySquare !== previousTheme.primarySquare) {
      // But still related (e.g., pin moved along a line)
      return true;
    }

    // Secondary squares changed significantly
    if (
      newTheme.secondarySquares &&
      previousTheme.secondarySquares &&
      !this.arraysEqual(newTheme.secondarySquares, previousTheme.secondarySquares)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Check if two arrays have the same elements
   */
  private arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, idx) => val === sortedB[idx]);
  }

  /**
   * Reset the tracker state
   */
  reset(): void {
    this.previousThemes.clear();
    this.currentPly = 0;
  }

  /**
   * Get previous themes
   */
  getPreviousThemes(): ThemeInstance[] {
    return Array.from(this.previousThemes.values());
  }

  /**
   * Initialize with themes from a previous position
   */
  initializeWithThemes(themes: ThemeInstance[]): void {
    this.previousThemes = new Map(themes.map((t) => [t.themeKey, t]));
  }

  /**
   * Get the current ply
   */
  getCurrentPly(): number {
    return this.currentPly;
  }
}

/**
 * Create a new theme lifecycle tracker
 */
export function createLifecycleTracker(
  config?: Partial<LifecycleTrackerConfig>,
): ThemeLifecycleTracker {
  return new ThemeLifecycleTracker(config);
}

/**
 * Filter deltas to only include significant transitions
 *
 * @param deltas - All deltas
 * @param options - Filter options
 */
export function filterSignificantDeltas(
  deltas: ThemeDelta[],
  options?: {
    includeEmerged?: boolean;
    includeEscalated?: boolean;
    includeResolved?: boolean;
    includeTransformed?: boolean;
    includePersisting?: boolean;
    minSeverity?: ThemeSeverity;
  },
): ThemeDelta[] {
  const opts = {
    includeEmerged: true,
    includeEscalated: true,
    includeResolved: false,
    includeTransformed: true,
    includePersisting: false,
    ...options,
  };

  const severityOrder: Record<ThemeSeverity, number> = {
    minor: 0,
    moderate: 1,
    significant: 2,
    critical: 3,
  };

  const minSeverityLevel = opts.minSeverity ? (severityOrder[opts.minSeverity] ?? 0) : 0;

  return deltas.filter((delta) => {
    // Check severity
    const themeSeverityLevel = severityOrder[delta.theme.severity] ?? 0;
    if (themeSeverityLevel < minSeverityLevel) {
      return false;
    }

    // Check transition type
    switch (delta.transition) {
      case 'emerged':
        return opts.includeEmerged;
      case 'escalated':
        return opts.includeEscalated;
      case 'resolved':
        return opts.includeResolved;
      case 'transformed':
        return opts.includeTransformed;
      case 'persisting':
        return opts.includePersisting;
      default:
        return false;
    }
  });
}

/**
 * Get themes that are novel (recently emerged)
 */
export function getNovelThemes(
  themes: ThemeInstance[],
  minNoveltyScore: number = 0.5,
): ThemeInstance[] {
  return themes.filter((t) => t.noveltyScore >= minNoveltyScore);
}

/**
 * Sort themes by a combination of novelty and severity
 */
export function sortThemesByImportance(themes: ThemeInstance[]): ThemeInstance[] {
  const severityScore: Record<ThemeSeverity, number> = {
    critical: 4,
    significant: 3,
    moderate: 2,
    minor: 1,
  };

  return [...themes].sort((a, b) => {
    // Combined score: severity + novelty
    const scoreA = (severityScore[a.severity] ?? 1) + a.noveltyScore;
    const scoreB = (severityScore[b.severity] ?? 1) + b.noveltyScore;
    return scoreB - scoreA;
  });
}
