/**
 * Ultra-Fast Chess Coach Integration
 *
 * Maps CLI configuration to the new Ultra-Fast Coach architecture components
 * and provides a runner for staged analysis with theme detection and narration.
 */

import type {
  StagedPipelineConfig,
  TierConfig,
  AnalysisTier,
  CriticalityScore,
} from '@chessbeast/core';
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
  /** Staged pipeline configuration */
  pipeline: Partial<StagedPipelineConfig>;

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
 * Map analysis speed to tier thresholds
 */
export function speedToTierThresholds(speed: AnalysisSpeed): {
  standardPromotion: number;
  fullPromotion: number;
} {
  switch (speed) {
    case 'fast':
      // Higher thresholds = fewer promotions = faster
      return { standardPromotion: 60, fullPromotion: 85 };
    case 'normal':
      return { standardPromotion: 40, fullPromotion: 70 };
    case 'deep':
      // Lower thresholds = more promotions = deeper
      return { standardPromotion: 25, fullPromotion: 55 };
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
  const tierThresholds = speedToTierThresholds(cliConfig.speed);
  const variationLimits = variationDepthToLimits(cliConfig.variations);
  const lineMemoryConfig = audienceToLineMemoryConfig(cliConfig.audience);

  return {
    pipeline: {
      tierThresholds,
      maxCriticalRatio:
        cliConfig.speed === 'fast' ? 0.15 : cliConfig.speed === 'deep' ? 0.35 : 0.25,
    },

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
 * Filter themes based on verbosity setting
 */
export function shouldIncludeTheme(
  verbosity: ThemeVerbosity,
  severity: 'critical' | 'significant' | 'moderate' | 'minor',
): boolean {
  switch (verbosity) {
    case 'none':
      return false;
    case 'important':
      return severity === 'critical' || severity === 'significant';
    case 'all':
      return true;
  }
}

/**
 * Determine if a position should be commented based on criticality and density
 */
export function shouldCommentPosition(
  criticalityScore: CriticalityScore,
  density: DensityLevel,
  plyInWindow: number,
  lastCommentPly: number,
): boolean {
  const minPlyGap = density === 'sparse' ? 4 : density === 'normal' ? 2 : 1;
  const minScore = density === 'sparse' ? 50 : density === 'normal' ? 30 : 15;

  // Always comment critical positions
  if (criticalityScore.score >= 70) {
    return true;
  }

  // Check density constraints
  if (plyInWindow - lastCommentPly < minPlyGap) {
    return false;
  }

  // Check score threshold
  return criticalityScore.score >= minScore;
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

/**
 * Ultra-Fast Coach progress information
 */
export interface UltraFastCoachProgress {
  /** Current phase */
  phase: 'analyzing' | 'themes' | 'narrating' | 'rendering';
  /** Current stage within phase */
  stage?: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current position being processed */
  currentPly?: number;
  /** Total positions */
  totalPlies?: number;
  /** Current tier being used */
  tier?: AnalysisTier;
}

/**
 * Ultra-Fast Coach result
 */
export interface UltraFastCoachResult {
  /** Number of positions analyzed */
  positionsAnalyzed: number;
  /** Number of themes detected */
  themesDetected: number;
  /** Number of comments generated */
  commentsGenerated: number;
  /** Cache statistics */
  cacheStats: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  /** Tier distribution */
  tierDistribution: Record<AnalysisTier, number>;
  /** Total analysis time (ms) */
  totalTimeMs: number;
  /** Token usage */
  tokensUsed: number;
}
