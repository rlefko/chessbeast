/**
 * Configuration module exports
 */

// Schema types
export type {
  AnalysisProfile,
  OutputVerbosity,
  AnalysisConfigSchema,
  RatingsConfigSchema,
  LLMConfigSchema,
  ServiceEndpoint,
  ServicesConfigSchema,
  DatabasesConfigSchema,
  OutputConfigSchema,
  ChessBeastConfig,
  CliOptions,
} from './schema.js';

// Defaults and profiles
export {
  ANALYSIS_PROFILES,
  DEFAULT_ANALYSIS_CONFIG,
  DEFAULT_RATINGS_CONFIG,
  DEFAULT_LLM_CONFIG,
  DEFAULT_STOCKFISH_CONFIG,
  DEFAULT_MAIA_CONFIG,
  DEFAULT_DATABASES_CONFIG,
  DEFAULT_OUTPUT_CONFIG,
  DEFAULT_CONFIG,
  applyProfile,
} from './defaults.js';

// Validation
export {
  configSchema,
  partialConfigSchema,
  analysisProfileSchema,
  outputVerbositySchema,
  ConfigValidationError,
  validateConfig,
  validatePartialConfig,
} from './validation.js';

// Loader
export { loadConfig, formatConfig } from './loader.js';
