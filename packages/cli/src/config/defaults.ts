/**
 * Default configuration values and profile presets
 */

import type { AnalysisProfile, AnalysisConfigSchema, ChessBeastConfig } from './schema.js';

/**
 * Analysis profile presets
 * Maps profile names to analysis configuration overrides
 */
export const ANALYSIS_PROFILES: Record<AnalysisProfile, Partial<AnalysisConfigSchema>> = {
  quick: {
    shallowDepth: 12,
    shallowTimeLimitMs: 2000, // 2 seconds max per position
    deepDepth: 16,
    deepTimeLimitMs: 5000, // 5 seconds max per position
    multiPvCount: 1,
    maxCriticalRatio: 0.15,
  },
  standard: {
    shallowDepth: 14,
    shallowTimeLimitMs: 3000, // 3 seconds max per position
    deepDepth: 22,
    deepTimeLimitMs: 10000, // 10 seconds max per position
    multiPvCount: 3,
    maxCriticalRatio: 0.25,
  },
  deep: {
    shallowDepth: 18,
    shallowTimeLimitMs: 5000, // 5 seconds max per position
    deepDepth: 28,
    deepTimeLimitMs: 20000, // 20 seconds max per position
    multiPvCount: 5,
    maxCriticalRatio: 0.35,
  },
};

/**
 * Default analysis configuration (standard profile)
 */
export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfigSchema = {
  profile: 'standard',
  shallowDepth: 14,
  shallowTimeLimitMs: 3000,
  deepDepth: 22,
  deepTimeLimitMs: 10000,
  multiPvCount: 3,
  maxCriticalRatio: 0.25,
  skipMaia: false,
  skipLlm: false,
};

/**
 * Default rating configuration
 */
export const DEFAULT_RATINGS_CONFIG = {
  defaultRating: 1500,
};

/**
 * Default LLM configuration
 */
export const DEFAULT_LLM_CONFIG = {
  model: 'gpt-5',
  temperature: 0.7,
  timeout: 30000,
  reasoningEffort: 'medium' as const,
  streaming: true,
};

/**
 * Default agentic annotation configuration
 */
export const DEFAULT_AGENTIC_CONFIG = {
  enabled: false,
  annotateAll: false,
  maxToolCalls: 5,
  showCosts: true,
};

/**
 * Default Stockfish service configuration
 */
export const DEFAULT_STOCKFISH_CONFIG = {
  host: 'localhost',
  port: 50051,
  timeoutMs: 300000, // 5 minutes for deep analysis
};

/**
 * Default Maia service configuration
 */
export const DEFAULT_MAIA_CONFIG = {
  host: 'localhost',
  port: 50052,
  timeoutMs: 30000,
};

/**
 * Default database paths (relative to data directory)
 */
export const DEFAULT_DATABASES_CONFIG = {
  ecoPath: 'data/eco.db',
  lichessPath: 'data/lichess_elite.db',
};

/**
 * Default output configuration
 */
export const DEFAULT_OUTPUT_CONFIG = {
  verbosity: 'normal' as const,
  includeVariations: true,
  includeNags: true,
  includeSummary: true,
  perspective: 'neutral' as const,
};

/**
 * Complete default configuration
 */
export const DEFAULT_CONFIG: ChessBeastConfig = {
  analysis: DEFAULT_ANALYSIS_CONFIG,
  ratings: DEFAULT_RATINGS_CONFIG,
  llm: DEFAULT_LLM_CONFIG,
  agentic: DEFAULT_AGENTIC_CONFIG,
  services: {
    stockfish: DEFAULT_STOCKFISH_CONFIG,
    maia: DEFAULT_MAIA_CONFIG,
  },
  databases: DEFAULT_DATABASES_CONFIG,
  output: DEFAULT_OUTPUT_CONFIG,
};

/**
 * Apply profile presets to analysis configuration
 */
export function applyProfile(
  config: AnalysisConfigSchema,
  profile: AnalysisProfile,
): AnalysisConfigSchema {
  const profilePreset = ANALYSIS_PROFILES[profile];
  return {
    ...config,
    ...profilePreset,
    profile,
  };
}
