/**
 * Variation Explorer module
 *
 * Iteratively explores chess variations with engine and LLM guidance.
 */

// Original variation explorer
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

// Agentic variation explorer
export {
  AgenticVariationExplorer,
  createAgenticExplorer,
  type AgenticExplorerConfig,
  type AgenticExplorerProgress,
  type AgenticExplorerResult,
} from './agentic-explorer.js';

// Exploration state management
export { ExplorationState, type ExploredMove, type ExploredBranch } from './exploration-state.js';

// Exploration tools
export { EXPLORATION_TOOLS, EXPLORATION_TOOL_NAMES } from './exploration-tools.js';

// Stopping heuristics
export {
  assessContinuation,
  shouldHardStop,
  getBudgetGuidance,
  DEFAULT_STOPPING_CONFIG,
  type ContinuationAssessment,
  type StoppingConfig,
} from './stopping-heuristics.js';

// Tree-based variation structure
export {
  VariationTree,
  type VariationNode,
  type CachedEval,
  type TreeOperationResult,
  type NodeInfo,
} from './variation-tree.js';

// Winning position filter
export {
  assessExplorationWorthiness,
  type ExplorationWorthiness,
} from './winning-position-filter.js';
