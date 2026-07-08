/**
 * Ultra-Fast Chess Coach Integration
 *
 * Maps CLI configuration to the new Ultra-Fast Coach architecture components
 * and provides a runner for staged analysis with theme detection and narration.
 */

import type { TierConfig, AnalysisTier, ArtifactCacheConfig } from '@chessbeast/core';
import type { DensityLevel, NarratorConfig, LineMemoryConfig } from '@chessbeast/llm';

import type {
  AnalysisSpeed,
  ThemeVerbosity,
  VariationDepth,
  CommentDensity,
  AudienceLevel,
  UltraFastCoachConfigSchema,
} from '../config/schema.js';

/**
 * Maximum words per generated comment
 */
const MAX_WORDS_PER_COMMENT = 50;

/**
 * Maximum comments per annotated game
 */
const MAX_COMMENTS_PER_GAME = 30;

/**
 * Exploration time budget (ms) for the full tier
 */
const EXPLORATION_BUDGET_MS_FULL = 120000;

/**
 * Exploration time budget (ms) for the shallow/standard tiers
 */
const EXPLORATION_BUDGET_MS_DEFAULT = 60000;

/**
 * Artifact cache time-to-live (1 hour)
 */
const ARTIFACT_CACHE_TTL_MS = 3600000;

/**
 * Artifact cache sizing for the full tier
 */
const ARTIFACT_CACHE_SIZING_FULL = {
  maxEngineEvals: 5000,
  maxThemes: 3000,
  maxCandidates: 2000,
} as const;

/**
 * Artifact cache sizing for the shallow/standard tiers
 */
const ARTIFACT_CACHE_SIZING_DEFAULT = {
  maxEngineEvals: 2000,
  maxThemes: 1000,
  maxCandidates: 500,
} as const;

/**
 * Complete Ultra-Fast Coach configuration
 * Maps CLI options to component configurations
 */
export interface UltraFastCoachConfig {
  /** Tier override (if specified via speed) */
  defaultTier: AnalysisTier;

  /** Theme detection settings */
  themes: {
    enabled: boolean;
    verbosity: ThemeVerbosity;
  };

  /** Variation exploration settings */
  variations: {
    depth: VariationDepth;
    maxNodes: number;
    maxDepth: number;
    /** Exploration time budget in milliseconds (derived from the tier) */
    budgetMs: number;
  };

  /** Narration settings */
  narration: Partial<NarratorConfig>;

  /** Density filter level */
  density: DensityLevel;

  /** Line memory configuration */
  lineMemory: Partial<LineMemoryConfig>;

  /** Maximum comments per annotated game */
  maxCommentsPerGame: number;

  /** Artifact cache sizing (derived from the tier) */
  artifactCache: Partial<ArtifactCacheConfig>;
}

/**
 * Map analysis speed to tier configuration
 */
export function speedToTier(speed: AnalysisSpeed): AnalysisTier {
  switch (speed) {
    case 'fast':
      return 'shallow';
    case 'normal':
      return 'standard';
    case 'deep':
      return 'full';
  }
}

/**
 * Map variation depth to exploration limits
 */
export function variationDepthToLimits(depth: VariationDepth): {
  maxNodes: number;
  maxDepth: number;
} {
  switch (depth) {
    case 'low':
      return { maxNodes: 100, maxDepth: 20 };
    case 'medium':
      return { maxNodes: 300, maxDepth: 40 };
    case 'high':
      return { maxNodes: 600, maxDepth: 60 };
  }
}

/**
 * Map comment density to density level
 */
export function commentDensityToLevel(density: CommentDensity): DensityLevel {
  switch (density) {
    case 'sparse':
      return 'sparse';
    case 'normal':
      return 'normal';
    case 'verbose':
      return 'verbose';
  }
}

/**
 * Map audience level to line memory configuration
 */
export function audienceToLineMemoryConfig(audience: AudienceLevel): Partial<LineMemoryConfig> {
  switch (audience) {
    case 'beginner':
      // More detail for beginners
      return {
        maxSummaryEntries: 20,
        evalSwingThreshold: 60, // Lower threshold = more entries
      };
    case 'club':
      return {
        maxSummaryEntries: 15,
        evalSwingThreshold: 80,
      };
    case 'expert':
      // Less hand-holding for experts
      return {
        maxSummaryEntries: 10,
        evalSwingThreshold: 100,
      };
  }
}

/**
 * Create Ultra-Fast Coach configuration from CLI config
 */
export function createUltraFastCoachConfig(
  cliConfig: UltraFastCoachConfigSchema,
): UltraFastCoachConfig {
  const defaultTier = speedToTier(cliConfig.speed);
  const variationLimits = variationDepthToLimits(cliConfig.variations);
  const lineMemoryConfig = audienceToLineMemoryConfig(cliConfig.audience);
  const isFullTier = defaultTier === 'full';

  return {
    defaultTier,

    themes: {
      enabled: cliConfig.themes !== 'none',
      verbosity: cliConfig.themes,
    },

    variations: {
      depth: cliConfig.variations,
      ...variationLimits,
      budgetMs: isFullTier ? EXPLORATION_BUDGET_MS_FULL : EXPLORATION_BUDGET_MS_DEFAULT,
    },

    narration: {
      audience: cliConfig.audience,
      showEvaluations: cliConfig.audience !== 'beginner',
      includeVariations: cliConfig.variations !== 'low',
      maxWordsPerComment: MAX_WORDS_PER_COMMENT,
    },

    density: commentDensityToLevel(cliConfig.commentDensity),

    lineMemory: lineMemoryConfig,

    maxCommentsPerGame: MAX_COMMENTS_PER_GAME,

    artifactCache: {
      ...(isFullTier ? ARTIFACT_CACHE_SIZING_FULL : ARTIFACT_CACHE_SIZING_DEFAULT),
      ttlMs: ARTIFACT_CACHE_TTL_MS,
    },
  };
}

/**
 * Get tier configuration for the Ultra-Fast Coach
 */
export function getUltraFastTierConfig(
  _config: UltraFastCoachConfig,
): Record<AnalysisTier, Partial<TierConfig>> {
  const baseConfigs: Record<AnalysisTier, Partial<TierConfig>> = {
    shallow: {
      tier: 'shallow',
      depth: 12,
      timeLimitMs: 1500,
      multipv: 1,
    },
    standard: {
      tier: 'standard',
      depth: 18,
      timeLimitMs: 5000,
      multipv: 3,
    },
    full: {
      tier: 'full',
      depth: 22,
      timeLimitMs: 15000,
      multipv: 5,
    },
  };

  return baseConfigs;
}
