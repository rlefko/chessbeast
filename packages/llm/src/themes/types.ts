/**
 * Theme Detection Types
 *
 * Core types for the theme detection system including theme instances,
 * lifecycle tracking, and delta computations.
 */

import type {
  ThemeType,
  ThemeCategory,
  ThemeSeverity,
  ThemeConfidence,
  ThemePieceInfo,
} from '@chessbeast/core/storage';

/**
 * Theme lifecycle status
 */
export type ThemeStatus =
  | 'emerged' // Just appeared in this position
  | 'persisting' // Continues from previous position
  | 'escalated' // Severity increased
  | 'resolved' // Theme no longer present
  | 'transformed'; // Theme changed form (e.g., threat became capture)

/**
 * Theme instance with lifecycle tracking
 *
 * Extends the basic DetectedTheme with temporal information
 * for tracking how themes evolve across positions.
 */
export interface ThemeInstance {
  /** Unique key for this theme: "${type}:${square}:${beneficiary}" */
  themeKey: string;

  /** Theme type identifier */
  type: ThemeType;

  /** Theme category */
  category: ThemeCategory;

  /** Which side benefits */
  beneficiary: 'w' | 'b';

  /** Primary square involved */
  primarySquare: string;

  /** Secondary squares involved */
  secondarySquares?: string[];

  /** Pieces involved in the theme */
  pieces?: ThemePieceInfo[];

  /** Pedagogical severity */
  severity: ThemeSeverity;

  /** Detection confidence (0-1) */
  confidence: number;

  /** Confidence level category */
  confidenceLevel: ThemeConfidence;

  /** Material at stake (in centipawns) */
  materialAtStake?: number;

  /** Short explanation for display */
  explanation: string;

  /** Detailed explanation for teaching */
  detailedExplanation?: string;

  // Lifecycle tracking
  /** Ply when this theme first appeared */
  firstSeenPly: number;

  /** Ply when this theme was last seen */
  lastSeenPly: number;

  /** Current lifecycle status */
  status: ThemeStatus;

  /** Novelty score (0-1), decays over time */
  noveltyScore: number;
}

/**
 * Theme delta representing a change in theme status
 */
export interface ThemeDelta {
  /** The theme instance */
  theme: ThemeInstance;

  /** Previous status (undefined if newly emerged) */
  previousStatus?: ThemeStatus;

  /** The transition type */
  transition: ThemeStatus;

  /** Description of what changed */
  changeDescription?: string;

  /** Previous severity (if escalated) */
  previousSeverity?: ThemeSeverity;
}

/**
 * Aggregate theme summary for a position
 */
export interface ThemeSummary {
  /** All active themes */
  activeThemes: ThemeInstance[];

  /** Themes grouped by category */
  byCategory: Record<ThemeCategory, ThemeInstance[]>;

  /** Themes grouped by beneficiary */
  byBeneficiary: {
    white: ThemeInstance[];
    black: ThemeInstance[];
  };

  /** Most critical themes */
  critical: ThemeInstance[];

  /** Newly emerged themes */
  emerged: ThemeInstance[];

  /** Themes that were resolved */
  resolved: ThemeInstance[];

  /** Total theme count */
  totalCount: number;

  /** Sum of material at stake */
  totalMaterialAtStake: number;
}

/**
 * Generate a unique theme key
 */
export function generateThemeKey(
  type: ThemeType,
  primarySquare: string,
  beneficiary: 'w' | 'b',
): string {
  return `${type}:${primarySquare}:${beneficiary}`;
}

/**
 * Calculate novelty score based on how long a theme has persisted
 *
 * Themes that just emerged have high novelty (1.0).
 * Novelty decays as the theme persists across positions.
 */
export function calculateNoveltyScore(
  firstSeenPly: number,
  currentPly: number,
  decayRate: number = 0.15,
): number {
  const age = currentPly - firstSeenPly;
  return Math.max(0, 1 - age * decayRate);
}

/**
 * Create a theme instance from detection results
 */
export function createThemeInstance(
  type: ThemeType,
  category: ThemeCategory,
  beneficiary: 'w' | 'b',
  primarySquare: string,
  severity: ThemeSeverity,
  confidence: number,
  explanation: string,
  currentPly: number,
  options?: {
    secondarySquares?: string[];
    pieces?: ThemePieceInfo[];
    materialAtStake?: number;
    detailedExplanation?: string;
    firstSeenPly?: number;
    status?: ThemeStatus;
  },
): ThemeInstance {
  const firstSeenPly = options?.firstSeenPly ?? currentPly;

  const confidenceLevel: ThemeConfidence =
    confidence >= 0.9
      ? 'certain'
      : confidence >= 0.8
        ? 'high'
        : confidence >= 0.6
          ? 'medium'
          : 'low';

  const instance: ThemeInstance = {
    themeKey: generateThemeKey(type, primarySquare, beneficiary),
    type,
    category,
    beneficiary,
    primarySquare,
    severity,
    confidence,
    confidenceLevel,
    explanation,
    firstSeenPly,
    lastSeenPly: currentPly,
    status: options?.status ?? 'emerged',
    noveltyScore: calculateNoveltyScore(firstSeenPly, currentPly),
  };

  if (options?.secondarySquares !== undefined) {
    instance.secondarySquares = options.secondarySquares;
  }
  if (options?.pieces !== undefined) {
    instance.pieces = options.pieces;
  }
  if (options?.materialAtStake !== undefined) {
    instance.materialAtStake = options.materialAtStake;
  }
  if (options?.detailedExplanation !== undefined) {
    instance.detailedExplanation = options.detailedExplanation;
  }

  return instance;
}

/**
 * Create a theme delta for a transition
 */
export function createThemeDelta(
  theme: ThemeInstance,
  transition: ThemeStatus,
  options?: {
    previousStatus?: ThemeStatus;
    previousSeverity?: ThemeSeverity;
    changeDescription?: string;
  },
): ThemeDelta {
  const delta: ThemeDelta = {
    theme,
    transition,
  };

  if (options?.previousStatus !== undefined) {
    delta.previousStatus = options.previousStatus;
  }
  if (options?.previousSeverity !== undefined) {
    delta.previousSeverity = options.previousSeverity;
  }
  if (options?.changeDescription !== undefined) {
    delta.changeDescription = options.changeDescription;
  }

  return delta;
}

/**
 * Create an empty theme summary
 */
export function createEmptyThemeSummary(): ThemeSummary {
  return {
    activeThemes: [],
    byCategory: {
      tactical: [],
      structural: [],
      positional: [],
      dynamic: [],
    },
    byBeneficiary: {
      white: [],
      black: [],
    },
    critical: [],
    emerged: [],
    resolved: [],
    totalCount: 0,
    totalMaterialAtStake: 0,
  };
}

/**
 * Build a theme summary from a list of themes and deltas
 */
export function buildThemeSummary(themes: ThemeInstance[], deltas: ThemeDelta[]): ThemeSummary {
  const summary = createEmptyThemeSummary();

  summary.activeThemes = themes;
  summary.totalCount = themes.length;

  for (const theme of themes) {
    // By category
    const categoryArray = summary.byCategory[theme.category];
    if (categoryArray) {
      categoryArray.push(theme);
    }

    // By beneficiary
    if (theme.beneficiary === 'w') {
      summary.byBeneficiary.white.push(theme);
    } else {
      summary.byBeneficiary.black.push(theme);
    }

    // Critical themes
    if (theme.severity === 'critical' || theme.severity === 'significant') {
      summary.critical.push(theme);
    }

    // Emerged themes
    if (theme.status === 'emerged') {
      summary.emerged.push(theme);
    }

    // Material at stake
    if (theme.materialAtStake) {
      summary.totalMaterialAtStake += theme.materialAtStake;
    }
  }

  // Resolved themes from deltas
  for (const delta of deltas) {
    if (delta.transition === 'resolved') {
      summary.resolved.push(delta.theme);
    }
  }

  return summary;
}
