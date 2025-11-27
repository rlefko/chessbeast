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
