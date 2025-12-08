/**
 * Variation DAG Edge
 *
 * An edge in the variation DAG representing a chess move.
 * Edges connect nodes (positions) and carry move metadata.
 */

import type { ArtifactRef } from '../artifacts/base.js';

import type { NodeId, EdgeId } from './node.js';

/**
 * Edge creation source
 */
export type EdgeSource = 'mainline' | 'engine' | 'maia' | 'llm' | 'user' | 'exploration';

/**
 * Metadata about edge creation
 */
export interface EdgeMetadata {
  /** When the edge was created (ISO 8601) */
  createdAt: string;

  /** How this edge was created */
  source: EdgeSource;

  /** Initial exploration priority (0-100) */
  initialPriority?: number;

  /** Why this move was explored */
  explorationReason?: string;
}

/**
 * An edge in the variation DAG representing a move
 */
export interface VariationEdge {
  /** Unique edge identifier */
  readonly edgeId: EdgeId;

  /** Source node (position before move) */
  readonly fromNode: NodeId;

  /** Target node (position after move) */
  readonly toNode: NodeId;

  /** Move in SAN notation */
  readonly san: string;

  /** Move in UCI notation */
  readonly uci: string;

  /** Reference to move assessment artifact */
  moveAssessmentRef?: ArtifactRef;

  /** NAGs assigned to this move (e.g., ['$1', '$18']) */
  nags: string[];

  /** Comment on this move */
  comment?: string;

  /** Is this the principal (main line) continuation from parent? */
  isPrincipal: boolean;

  /** Edge metadata */
  metadata: EdgeMetadata;
}

/**
 * Create a new variation edge
 */
export function createVariationEdge(
  edgeId: EdgeId,
  fromNode: NodeId,
  toNode: NodeId,
  san: string,
  uci: string,
  source: EdgeSource,
  options?: {
    isPrincipal?: boolean;
    initialPriority?: number;
    explorationReason?: string;
  },
): VariationEdge {
  const metadata: EdgeMetadata = {
    createdAt: new Date().toISOString(),
    source,
  };

  if (options?.initialPriority !== undefined) {
    metadata.initialPriority = options.initialPriority;
  }
  if (options?.explorationReason !== undefined) {
    metadata.explorationReason = options.explorationReason;
  }

  return {
    edgeId,
    fromNode,
    toNode,
    san,
    uci,
    nags: [],
    isPrincipal: options?.isPrincipal ?? false,
    metadata,
  };
}

/**
 * Set the comment on an edge
 */
export function setEdgeComment(edge: VariationEdge, comment: string): void {
  edge.comment = comment;
}

/**
 * Add a NAG to an edge
 */
export function addEdgeNag(edge: VariationEdge, nag: string): void {
  if (!edge.nags.includes(nag)) {
    edge.nags.push(nag);
  }
}

/**
 * Remove a NAG from an edge
 */
export function removeEdgeNag(edge: VariationEdge, nag: string): void {
  edge.nags = edge.nags.filter((n) => n !== nag);
}

/**
 * Set all NAGs on an edge
 */
export function setEdgeNags(edge: VariationEdge, nags: string[]): void {
  edge.nags = [...nags];
}

/**
 * Clear all NAGs from an edge
 */
export function clearEdgeNags(edge: VariationEdge): void {
  edge.nags = [];
}

/**
 * Set the move assessment reference
 */
export function setMoveAssessmentRef(edge: VariationEdge, ref: ArtifactRef): void {
  edge.moveAssessmentRef = ref;
}

/**
 * Mark an edge as principal (main line)
 */
export function setPrincipal(edge: VariationEdge, isPrincipal: boolean): void {
  (edge as { isPrincipal: boolean }).isPrincipal = isPrincipal;
}

/**
 * Generate a unique edge ID
 */
let edgeIdCounter = 0;
export function generateEdgeId(): EdgeId {
  return `edge_${Date.now()}_${edgeIdCounter++}`;
}

/**
 * Reset edge ID counter (for testing)
 */
export function resetEdgeIdCounter(): void {
  edgeIdCounter = 0;
}

/**
 * Get the NAG string for an edge (for PGN output)
 */
export function getNagString(edge: VariationEdge): string {
  return edge.nags.join(' ');
}

/**
 * Check if an edge has any annotations (NAGs or comments)
 */
export function hasAnnotations(edge: VariationEdge): boolean {
  return edge.nags.length > 0 || !!edge.comment;
}

/**
 * Get a display string for the edge (SAN + NAGs)
 */
export function getEdgeDisplayString(edge: VariationEdge): string {
  if (edge.nags.length === 0) {
    return edge.san;
  }
  return `${edge.san} ${getNagString(edge)}`;
}
