/**
 * Variation DAG Node
 *
 * A node in the variation DAG representing a chess position.
 * Unlike a tree, nodes can have multiple parent edges (transpositions).
 */

import type { ArtifactRef } from '../artifacts/base.js';

/**
 * Unique node identifier
 */
export type NodeId = string;

/**
 * Unique edge identifier
 */
export type EdgeId = string;

/**
 * Node creation source
 */
export type NodeSource = 'mainline' | 'exploration' | 'transposition' | 'user';

/**
 * Metadata about node creation and exploration
 */
export interface NodeMetadata {
  /** When the node was created (ISO 8601) */
  createdAt: string;

  /** When the node was last visited (ISO 8601) */
  lastVisitedAt: string;

  /** Number of times this node was visited */
  visitCount: number;

  /** How this node was created */
  source: NodeSource;

  /** Depth in exploration (0 = root) */
  depth: number;
}

/**
 * Decision reference - links to exploration/annotation decisions
 */
export interface DecisionRef {
  /** Decision type */
  type: 'exploration' | 'annotation' | 'stop';

  /** Decision key for retrieval */
  key: string;

  /** When the decision was made */
  timestamp: string;
}

/**
 * A node in the variation DAG representing a chess position
 *
 * Key features:
 * - Multiple parent edges for transposition support
 * - Artifact references for lazy loading
 * - Work queue for exploration planning
 */
export interface VariationNode {
  /** Unique node identifier */
  readonly nodeId: NodeId;

  /** Position key (zobrist:normalizedFen format) */
  readonly positionKey: string;

  /** Full FEN for position reconstruction */
  readonly fen: string;

  /** Ply depth from game start (0 = before first move) */
  readonly ply: number;

  /** Side to move */
  readonly sideToMove: 'w' | 'b';

  /** Edges leading TO this node (transposition support) */
  parentEdges: EdgeId[];

  /** Edges leading FROM this node */
  childEdges: EdgeId[];

  /** References to computed artifacts (lazy-loaded) */
  artifactRefs: ArtifactRef[];

  /** References to exploration decisions */
  decisionRefs: DecisionRef[];

  /** Cached best continuation for quick access */
  principalChildEdge?: EdgeId;

  /** Work queue: moves marked for exploration */
  interestingMoves: string[];

  /** Node metadata */
  metadata: NodeMetadata;
}

/**
 * Create a new variation node
 */
export function createVariationNode(
  nodeId: NodeId,
  positionKey: string,
  fen: string,
  ply: number,
  source: NodeSource,
  depth: number = 0,
): VariationNode {
  const now = new Date().toISOString();
  const sideToMove = fen.split(' ')[1] as 'w' | 'b';

  return {
    nodeId,
    positionKey,
    fen,
    ply,
    sideToMove,
    parentEdges: [],
    childEdges: [],
    artifactRefs: [],
    decisionRefs: [],
    interestingMoves: [],
    metadata: {
      createdAt: now,
      lastVisitedAt: now,
      visitCount: 1,
      source,
      depth,
    },
  };
}

/**
 * Update node visit metadata
 */
export function visitNode(node: VariationNode): void {
  node.metadata.lastVisitedAt = new Date().toISOString();
  node.metadata.visitCount++;
}

/**
 * Add an artifact reference to a node
 */
export function addArtifactRef(node: VariationNode, ref: ArtifactRef): void {
  // Avoid duplicates
  const existing = node.artifactRefs.find((r) => r.artifactKey === ref.artifactKey);
  if (!existing) {
    node.artifactRefs.push(ref);
  }
}

/**
 * Get artifact reference by kind
 */
export function getArtifactRef(node: VariationNode, kind: string): ArtifactRef | undefined {
  return node.artifactRefs.find((r) => r.kind === kind);
}

/**
 * Add a decision reference to a node
 */
export function addDecisionRef(node: VariationNode, ref: DecisionRef): void {
  node.decisionRefs.push(ref);
}

/**
 * Mark moves as interesting for exploration
 */
export function markInteresting(node: VariationNode, moves: string[]): void {
  for (const move of moves) {
    if (!node.interestingMoves.includes(move)) {
      node.interestingMoves.push(move);
    }
  }
}

/**
 * Clear an interesting move (mark as explored)
 */
export function clearInteresting(node: VariationNode, move: string): void {
  node.interestingMoves = node.interestingMoves.filter((m) => m !== move);
}

/**
 * Check if a node is the root (no parent edges)
 */
export function isRootNode(node: VariationNode): boolean {
  return node.parentEdges.length === 0;
}

/**
 * Check if a node is a leaf (no child edges)
 */
export function isLeafNode(node: VariationNode): boolean {
  return node.childEdges.length === 0;
}

/**
 * Check if a node is a transposition (multiple parent edges)
 */
export function isTransposition(node: VariationNode): boolean {
  return node.parentEdges.length > 1;
}

/**
 * Generate a unique node ID
 */
let nodeIdCounter = 0;
export function generateNodeId(): NodeId {
  return `node_${Date.now()}_${nodeIdCounter++}`;
}

/**
 * Reset node ID counter (for testing)
 */
export function resetNodeIdCounter(): void {
  nodeIdCounter = 0;
}
