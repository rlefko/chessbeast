/**
 * Exploration Module
 *
 * Provides priority-based exploration of chess variations.
 * Uses a priority queue to focus on the most critical/interesting
 * positions first, with configurable stopping conditions.
 */

// Priority Queue
export { PriorityQueue, createMaxNumberQueue, createMinNumberQueue } from './priority-queue.js';

// Exploration Node
export {
  type ExplorationNode,
  type ExplorationWeights,
  type CreateNodeOptions,
  DEFAULT_EXPLORATION_WEIGHTS,
  createExplorationNode,
  calculateExplorationPriority,
  updateExplorationPriority,
  markExplored,
  markFrontier,
  updateCriticality,
  updateInformationGain,
  decayNovelty,
  promoteTier,
  generateNodeId,
  compareByPriority,
  shouldExplore,
} from './exploration-node.js';

// Stopping Conditions
export {
  type StoppingReason,
  type StoppingConfig,
  type ExplorationState,
  type StoppingResult,
  DEFAULT_STOPPING_CONFIG,
  STOPPING_PRESETS,
  shouldStop,
  isPositionResolved,
  remainingBudget,
  remainingNodes,
  explorationProgress,
  createInitialState,
  updateState,
  addEvalToHistory,
  isConditionMet,
  createStoppingConfig,
} from './stopping-conditions.js';

// Priority Queue Explorer
export {
  type ExplorerConfig,
  type ExplorationResult,
  type CandidateMove,
  PriorityQueueExplorer,
  createPriorityQueueExplorer,
} from './priority-queue-explorer.js';
