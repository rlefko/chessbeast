/**
 * Stopping Conditions
 *
 * Heuristics for determining when to stop exploring variations.
 * Used by the priority queue explorer to bound the search.
 */

/**
 * Reason for stopping exploration
 */
export type StoppingReason =
  | 'budget_exhausted' // Time budget exceeded
  | 'max_nodes_reached' // Node limit reached
  | 'max_depth_reached' // Depth limit reached
  | 'queue_empty' // No more positions to explore
  | 'priority_threshold' // All remaining positions below threshold
  | 'position_resolved' // Position evaluation is stable
  | 'user_stopped'; // User requested stop

/**
 * Configuration for stopping conditions
 */
export interface StoppingConfig {
  /** Maximum number of nodes to explore */
  maxNodes: number;

  /** Maximum exploration depth */
  maxDepth: number;

  /** Time budget in milliseconds */
  budgetMs: number;

  /** Minimum priority to continue exploring */
  minPriority: number;

  /** Number of stable evaluations to consider position resolved */
  evalStabilityThreshold: number;

  /** Maximum centipawn variation for stability */
  evalStabilityCpRange: number;
}

/**
 * Default stopping configuration
 */
export const DEFAULT_STOPPING_CONFIG: StoppingConfig = {
  maxNodes: 500,
  maxDepth: 40,
  budgetMs: 60000, // 1 minute
  minPriority: 10,
  evalStabilityThreshold: 5,
  evalStabilityCpRange: 30,
};

/**
 * Current exploration state for stopping checks
 */
export interface ExplorationState {
  /** Number of nodes explored so far */
  nodesExplored: number;

  /** Maximum depth reached */
  maxDepthReached: number;

  /** Time elapsed in milliseconds */
  elapsedMs: number;

  /** Current highest priority in queue */
  currentHighestPriority: number;

  /** Whether queue is empty */
  queueEmpty: boolean;

  /** Whether user requested stop */
  userStopped: boolean;

  /** Recent evaluation history (for stability check) */
  recentEvals?: number[];
}

/**
 * Result of stopping check
 */
export interface StoppingResult {
  /** Whether exploration should stop */
  stop: boolean;

  /** Reason for stopping (if stop is true) */
  reason?: StoppingReason;

  /** Human-readable explanation */
  explanation?: string;
}

/**
 * Check if exploration should stop
 *
 * @param state - Current exploration state
 * @param config - Stopping configuration
 * @returns Whether to stop and why
 */
export function shouldStop(
  state: ExplorationState,
  config: StoppingConfig = DEFAULT_STOPPING_CONFIG,
): StoppingResult {
  // Check user stop request first
  if (state.userStopped) {
    return {
      stop: true,
      reason: 'user_stopped',
      explanation: 'User requested stop',
    };
  }

  // Check budget exhaustion
  if (state.elapsedMs >= config.budgetMs) {
    return {
      stop: true,
      reason: 'budget_exhausted',
      explanation: `Time budget of ${config.budgetMs}ms exceeded`,
    };
  }

  // Check max nodes
  if (state.nodesExplored >= config.maxNodes) {
    return {
      stop: true,
      reason: 'max_nodes_reached',
      explanation: `Node limit of ${config.maxNodes} reached`,
    };
  }

  // Check max depth
  if (state.maxDepthReached >= config.maxDepth) {
    return {
      stop: true,
      reason: 'max_depth_reached',
      explanation: `Depth limit of ${config.maxDepth} reached`,
    };
  }

  // Check empty queue
  if (state.queueEmpty) {
    return {
      stop: true,
      reason: 'queue_empty',
      explanation: 'No more positions to explore',
    };
  }

  // Check priority threshold
  if (state.currentHighestPriority < config.minPriority) {
    return {
      stop: true,
      reason: 'priority_threshold',
      explanation: `All remaining positions below priority threshold of ${config.minPriority}`,
    };
  }

  // Check position resolution (if eval history provided)
  if (state.recentEvals && isPositionResolved(state.recentEvals, config)) {
    return {
      stop: true,
      reason: 'position_resolved',
      explanation: 'Position evaluation has stabilized',
    };
  }

  // Continue exploring
  return { stop: false };
}

/**
 * Check if a position's evaluation has stabilized
 *
 * A position is considered resolved if the last N evaluations
 * are within a certain centipawn range.
 *
 * @param evalHistory - Array of centipawn evaluations (most recent last)
 * @param config - Stopping configuration
 * @returns true if position is resolved
 */
export function isPositionResolved(
  evalHistory: number[],
  config: StoppingConfig = DEFAULT_STOPPING_CONFIG,
): boolean {
  if (evalHistory.length < config.evalStabilityThreshold) {
    return false;
  }

  // Get the last N evaluations
  const recentEvals = evalHistory.slice(-config.evalStabilityThreshold);

  // Find min and max
  const min = Math.min(...recentEvals);
  const max = Math.max(...recentEvals);

  // Check if range is within threshold
  return max - min <= config.evalStabilityCpRange;
}

/**
 * Calculate remaining budget
 *
 * @param state - Current exploration state
 * @param config - Stopping configuration
 * @returns Remaining time budget in milliseconds
 */
export function remainingBudget(state: ExplorationState, config: StoppingConfig): number {
  return Math.max(0, config.budgetMs - state.elapsedMs);
}

/**
 * Calculate remaining node budget
 *
 * @param state - Current exploration state
 * @param config - Stopping configuration
 * @returns Remaining node budget
 */
export function remainingNodes(state: ExplorationState, config: StoppingConfig): number {
  return Math.max(0, config.maxNodes - state.nodesExplored);
}

/**
 * Calculate progress percentage
 *
 * @param state - Current exploration state
 * @param config - Stopping configuration
 * @returns Progress as 0-100 percentage
 */
export function explorationProgress(state: ExplorationState, config: StoppingConfig): number {
  // Use the most restrictive metric
  const timeProgress = (state.elapsedMs / config.budgetMs) * 100;
  const nodeProgress = (state.nodesExplored / config.maxNodes) * 100;
  const depthProgress = (state.maxDepthReached / config.maxDepth) * 100;

  return Math.max(timeProgress, nodeProgress, depthProgress);
}

/**
 * Create initial exploration state
 */
export function createInitialState(): ExplorationState {
  return {
    nodesExplored: 0,
    maxDepthReached: 0,
    elapsedMs: 0,
    currentHighestPriority: 100,
    queueEmpty: false,
    userStopped: false,
    recentEvals: [],
  };
}

/**
 * Update exploration state with new values
 *
 * @param state - Current state (mutated)
 * @param updates - Partial state updates
 */
export function updateState(state: ExplorationState, updates: Partial<ExplorationState>): void {
  Object.assign(state, updates);
}

/**
 * Add evaluation to history
 *
 * @param state - Current state (mutated)
 * @param evalCp - Centipawn evaluation to add
 * @param maxHistory - Maximum history length (default: 20)
 */
export function addEvalToHistory(
  state: ExplorationState,
  evalCp: number,
  maxHistory: number = 20,
): void {
  if (!state.recentEvals) {
    state.recentEvals = [];
  }

  state.recentEvals.push(evalCp);

  // Trim history if too long
  if (state.recentEvals.length > maxHistory) {
    state.recentEvals = state.recentEvals.slice(-maxHistory);
  }
}

/**
 * Check if a specific stopping condition is met
 *
 * @param condition - The condition to check
 * @param state - Current exploration state
 * @param config - Stopping configuration
 * @returns true if the specific condition is met
 */
export function isConditionMet(
  condition: StoppingReason,
  state: ExplorationState,
  config: StoppingConfig,
): boolean {
  switch (condition) {
    case 'budget_exhausted':
      return state.elapsedMs >= config.budgetMs;
    case 'max_nodes_reached':
      return state.nodesExplored >= config.maxNodes;
    case 'max_depth_reached':
      return state.maxDepthReached >= config.maxDepth;
    case 'queue_empty':
      return state.queueEmpty;
    case 'priority_threshold':
      return state.currentHighestPriority < config.minPriority;
    case 'position_resolved':
      return state.recentEvals ? isPositionResolved(state.recentEvals, config) : false;
    case 'user_stopped':
      return state.userStopped;
    default:
      return false;
  }
}

/**
 * Create a stopping config with custom overrides
 *
 * @param overrides - Custom configuration values
 * @returns Complete stopping config
 */
export function createStoppingConfig(overrides: Partial<StoppingConfig> = {}): StoppingConfig {
  return { ...DEFAULT_STOPPING_CONFIG, ...overrides };
}

/**
 * Preset configurations for different use cases
 */
export const STOPPING_PRESETS = {
  /** Quick exploration for interactive use */
  quick: createStoppingConfig({
    maxNodes: 100,
    maxDepth: 20,
    budgetMs: 15000, // 15 seconds
    minPriority: 20,
  }),

  /** Standard exploration for analysis */
  standard: createStoppingConfig({
    maxNodes: 500,
    maxDepth: 40,
    budgetMs: 60000, // 1 minute
    minPriority: 10,
  }),

  /** Deep exploration for thorough analysis */
  deep: createStoppingConfig({
    maxNodes: 2000,
    maxDepth: 60,
    budgetMs: 300000, // 5 minutes
    minPriority: 5,
  }),

  /** Exhaustive exploration (be careful!) */
  exhaustive: createStoppingConfig({
    maxNodes: 10000,
    maxDepth: 100,
    budgetMs: 1800000, // 30 minutes
    minPriority: 1,
  }),
} as const;
