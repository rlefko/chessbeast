/**
 * Orchestrator module exports
 */

export type { Services } from './services.js';
export { performHealthChecks, initializeServices, closeServices } from './services.js';

export {
  createEngineAdapter,
  createMaiaAdapter,
  createOpeningAdapter,
  createReferenceGameAdapter,
} from './adapters.js';

export type { GameResult } from './orchestrator.js';
export { orchestrateAnalysis } from './orchestrator.js';

// Ultra-Fast Coach integration
export type {
  UltraFastCoachConfig,
  UltraFastCoachProgress,
  UltraFastCoachResult,
} from './ultra-fast-coach.js';
export {
  createUltraFastCoachConfig,
  speedToTier,
  speedToTierThresholds,
  variationDepthToLimits,
  commentDensityToLevel,
  audienceToLLMAudience,
  audienceToLineMemoryConfig,
  shouldIncludeTheme,
  shouldCommentPosition,
  getUltraFastTierConfig,
} from './ultra-fast-coach.js';
