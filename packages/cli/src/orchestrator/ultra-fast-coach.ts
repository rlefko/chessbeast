/**
 * Ultra-Fast Chess Coach Integration
 *
 * Maps CLI configuration to the new Ultra-Fast Coach architecture components
 * and provides a runner for staged analysis with theme detection and narration.
 */

import type { TierConfig, AnalysisTier } from '@chessbeast/core';
import type {
  DensityLevel,
  AudienceLevel,
  NarratorConfig,
  LineMemoryConfig,
} from '@chessbeast/llm';

import type {
  AnalysisSpeed,
  ThemeVerbosity,
  VariationDepth,
  CommentDensity,
  AudienceLevel as ConfigAudienceLevel,
  UltraFastCoachConfigSchema,
} from '../config/schema.js';

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
  };

  /** Narration settings */
  narration: Partial<NarratorConfig>;

  /** Density filter level */
  density: DensityLevel;

  /** Line memory configuration */
  lineMemory: Partial<LineMemoryConfig>;
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
 * Map audience level from config to LLM audience level
 */
export function audienceToLLMAudience(audience: ConfigAudienceLevel): AudienceLevel {
  // These are the same, but we explicitly map for type safety
  return audience as AudienceLevel;
}

/**
 * Map audience level to line memory configuration
 */
export function audienceToLineMemoryConfig(
  audience: ConfigAudienceLevel,
): Partial<LineMemoryConfig> {
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
  const variationLimits = variationDepthToLimits(cliConfig.variations);
  const lineMemoryConfig = audienceToLineMemoryConfig(cliConfig.audience);

  return {
    defaultTier: speedToTier(cliConfig.speed),

    themes: {
      enabled: cliConfig.themes !== 'none',
      verbosity: cliConfig.themes,
    },

    variations: {
      depth: cliConfig.variations,
      ...variationLimits,
    },

    narration: {
      audience: audienceToLLMAudience(cliConfig.audience),
      showEvaluations: cliConfig.audience !== 'beginner',
      includeVariations: cliConfig.variations !== 'low',
    },

    density: commentDensityToLevel(cliConfig.commentDensity),

    lineMemory: lineMemoryConfig,
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
