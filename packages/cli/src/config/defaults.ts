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
    deepDepth: 16,
    multiPvCount: 1,
    maxCriticalRatio: 0.15,
  },
  standard: {
    shallowDepth: 14,
    deepDepth: 22,
    multiPvCount: 3,
    maxCriticalRatio: 0.25,
  },
  deep: {
    shallowDepth: 18,
    deepDepth: 28,
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
  deepDepth: 22,
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
  model: 'gpt-4o',
  temperature: 0.7,
  timeout: 30000,
};

/**
 * Default Stockfish service configuration
 */
export const DEFAULT_STOCKFISH_CONFIG = {
  host: 'localhost',
  port: 50051,
  timeoutMs: 180000, // 3 minutes for deep analysis
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
};

/**
 * Complete default configuration
 */
export const DEFAULT_CONFIG: ChessBeastConfig = {
  analysis: DEFAULT_ANALYSIS_CONFIG,
  ratings: DEFAULT_RATINGS_CONFIG,
  llm: DEFAULT_LLM_CONFIG,
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
