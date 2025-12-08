/**
 * Exploration Node
 *
 * Represents a position in the exploration queue with associated scores
 * and state for the priority queue explorer.
 */

import type { AnalysisTier } from '../storage/artifacts/base.js';

/**
 * Exploration node representing a position to be analyzed
 */
export interface ExplorationNode {
  /** Unique identifier for this node */
  nodeId: string;

  /** Position key for cache lookup */
  positionKey: string;

  /** FEN string for the position */
  fen: string;

  /** Ply number in the game/variation */
  ply: number;

  // Scores
  /** Criticality score from position analysis (0-100) */
  criticalityScore: number;

  /** Overall exploration priority (calculated from multiple factors) */
  explorationPriority: number;

  /** Expected information gain from exploring this position */
  expectedInformationGain: number;

  /** Novelty score relative to existing lines (0-1) */
  noveltyScore: number;

  /** Estimated cost to analyze (time/resources) */
  costEstimate: number;

  // State
  /** Current analysis tier */
  tier: AnalysisTier;

  /** Whether this position has been fully explored */
  isExplored: boolean;

  /** Whether this is on the exploration frontier */
  isFrontier: boolean;

  /** Depth of exploration from the root */
  explorationDepth: number;

  // Parent tracking
  /** Parent node ID (undefined for root) */
  parentNodeId?: string;

  /** Move that led to this position (SAN) */
  parentMove?: string;

  /** Move that led to this position (UCI) */
  parentMoveUci?: string;
}

/**
 * Weights for exploration priority calculation
 */
export interface ExplorationWeights {
  /** Weight for criticality score */
  criticality: number;
  /** Weight for expected information gain */
  informationGain: number;
  /** Weight for novelty score */
  novelty: number;
  /** Weight for cost (subtracted) */
  cost: number;
}

/**
 * Default exploration weights
 */
export const DEFAULT_EXPLORATION_WEIGHTS: ExplorationWeights = {
  criticality: 1.0,
  informationGain: 1.5,
  novelty: 0.8,
  cost: 0.3,
};

/**
 * Options for creating an exploration node
 */
export interface CreateNodeOptions {
  /** Criticality score (default: 0) */
  criticalityScore?: number;

  /** Expected information gain (default: 0.5) */
  expectedInformationGain?: number;

  /** Novelty score (default: 1.0 for new positions) */
  noveltyScore?: number;

  /** Cost estimate (default: 1.0) */
  costEstimate?: number;

  /** Initial tier (default: 'shallow') */
  tier?: AnalysisTier;

  /** Parent node ID */
  parentNodeId?: string;

  /** Parent move (SAN) */
  parentMove?: string;

  /** Parent move (UCI) */
  parentMoveUci?: string;
}

/**
 * Create a new exploration node
 *
 * @param nodeId - Unique node identifier
 * @param positionKey - Position key for cache lookup
 * @param fen - FEN string
 * @param ply - Ply number
 * @param explorationDepth - Depth from root
 * @param options - Optional creation options
 * @returns New exploration node
 */
export function createExplorationNode(
  nodeId: string,
  positionKey: string,
  fen: string,
  ply: number,
  explorationDepth: number,
  options: CreateNodeOptions = {},
): ExplorationNode {
  const node: ExplorationNode = {
    nodeId,
    positionKey,
    fen,
    ply,
    criticalityScore: options.criticalityScore ?? 0,
    explorationPriority: 0, // Will be calculated
    expectedInformationGain: options.expectedInformationGain ?? 0.5,
    noveltyScore: options.noveltyScore ?? 1.0,
    costEstimate: options.costEstimate ?? 1.0,
    tier: options.tier ?? 'shallow',
    isExplored: false,
    isFrontier: true,
    explorationDepth,
  };

  // Add optional parent properties only if they have values
  if (options.parentNodeId !== undefined) {
    node.parentNodeId = options.parentNodeId;
  }
  if (options.parentMove !== undefined) {
    node.parentMove = options.parentMove;
  }
  if (options.parentMoveUci !== undefined) {
    node.parentMoveUci = options.parentMoveUci;
  }

  // Calculate initial priority
  node.explorationPriority = calculateExplorationPriority(node);

  return node;
}

/**
 * Calculate exploration priority for a node
 *
 * Formula:
 *   priority = w1 * criticality + w2 * informationGain + w3 * novelty - w4 * cost
 *
 * @param node - The exploration node
 * @param weights - Optional custom weights
 * @returns Exploration priority score
 */
export function calculateExplorationPriority(
  node: ExplorationNode,
  weights: ExplorationWeights = DEFAULT_EXPLORATION_WEIGHTS,
): number {
  // Normalize criticality to 0-1 range
  const normalizedCriticality = node.criticalityScore / 100;

  const priority =
    weights.criticality * normalizedCriticality +
    weights.informationGain * node.expectedInformationGain +
    weights.novelty * node.noveltyScore -
    weights.cost * node.costEstimate;

  // Apply depth penalty (reduce priority for very deep exploration)
  const depthPenalty = Math.max(0, 1 - node.explorationDepth / 100);

  return priority * depthPenalty * 100; // Scale to 0-100ish range
}

/**
 * Update exploration priority for a node
 *
 * @param node - The node to update (mutates in place)
 * @param weights - Optional custom weights
 */
export function updateExplorationPriority(
  node: ExplorationNode,
  weights?: ExplorationWeights,
): void {
  node.explorationPriority = calculateExplorationPriority(node, weights);
}

/**
 * Mark a node as explored
 *
 * @param node - The node to mark (mutates in place)
 */
export function markExplored(node: ExplorationNode): void {
  node.isExplored = true;
  node.isFrontier = false;
}

/**
 * Mark a node as frontier (ready to explore children)
 *
 * @param node - The node to mark (mutates in place)
 */
export function markFrontier(node: ExplorationNode): void {
  node.isFrontier = true;
}

/**
 * Update node criticality and recalculate priority
 *
 * @param node - The node to update (mutates in place)
 * @param criticalityScore - New criticality score
 */
export function updateCriticality(node: ExplorationNode, criticalityScore: number): void {
  node.criticalityScore = criticalityScore;
  node.explorationPriority = calculateExplorationPriority(node);
}

/**
 * Update expected information gain and recalculate priority
 *
 * @param node - The node to update (mutates in place)
 * @param gain - New expected information gain (0-1)
 */
export function updateInformationGain(node: ExplorationNode, gain: number): void {
  node.expectedInformationGain = Math.max(0, Math.min(1, gain));
  node.explorationPriority = calculateExplorationPriority(node);
}

/**
 * Decay novelty score (for persisting themes)
 *
 * @param node - The node to update (mutates in place)
 * @param decayRate - How much to decay (0-1)
 */
export function decayNovelty(node: ExplorationNode, decayRate: number = 0.1): void {
  node.noveltyScore = Math.max(0, node.noveltyScore - decayRate);
  node.explorationPriority = calculateExplorationPriority(node);
}

/**
 * Promote a node to a higher tier
 *
 * @param node - The node to promote (mutates in place)
 * @param tier - The tier to promote to
 */
export function promoteTier(node: ExplorationNode, tier: AnalysisTier): void {
  const tierOrder: Record<AnalysisTier, number> = {
    shallow: 0,
    standard: 1,
    full: 2,
  };

  // Only promote, never demote
  if (tierOrder[tier] > tierOrder[node.tier]) {
    node.tier = tier;
  }
}

/**
 * Generate a unique node ID
 *
 * @param positionKey - Position key
 * @param explorationDepth - Depth in exploration
 * @returns Unique node ID
 */
export function generateNodeId(positionKey: string, explorationDepth: number): string {
  // Use first part of position key + depth + random suffix
  const keyPart = positionKey.substring(0, 16);
  const random = Math.random().toString(36).substring(2, 8);
  return `${keyPart}_d${explorationDepth}_${random}`;
}

/**
 * Compare two nodes by exploration priority (for priority queue)
 *
 * @param a - First node
 * @param b - Second node
 * @returns Positive if a has higher priority, negative if b has higher
 */
export function compareByPriority(a: ExplorationNode, b: ExplorationNode): number {
  return a.explorationPriority - b.explorationPriority;
}

/**
 * Check if a node should be explored based on priority threshold
 *
 * @param node - The node to check
 * @param minPriority - Minimum priority threshold
 * @returns true if node should be explored
 */
export function shouldExplore(node: ExplorationNode, minPriority: number): boolean {
  return !node.isExplored && node.explorationPriority >= minPriority;
}
