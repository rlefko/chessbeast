/**
 * Variation Explorer module
 *
 * Iteratively explores chess variations with engine and LLM guidance.
 */

export {
  VariationExplorer,
  createVariationExplorer,
  type ExploredLine,
  type ExplorationSession,
  type ExplorationConfig,
  type LinePurpose,
  type LineSource,
  type EngineService,
  type MaiaService,
  type EngineEvaluation,
} from './variation-explorer.js';
