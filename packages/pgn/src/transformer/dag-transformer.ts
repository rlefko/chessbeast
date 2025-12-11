/**
 * DAG to MoveInfo Transformer
 *
 * Converts a VariationDAG into MoveInfo[] format for PGN rendering.
 * Handles principal path extraction, variation collection, and comment/NAG attachment.
 *
 * This is part of the Ultra-Fast Coach architecture where the engine explores
 * variations and builds a DAG, then comments are attached post-write.
 */

import { ChessPosition } from '../chess/position.js';
import type { MoveInfo } from '../index.js';

/**
 * Check if a string is in UCI format (e.g., "e2e4", "e7e8q")
 */
function isUciFormat(move: string): boolean {
  return /^[a-h][1-8][a-h][1-8][qrbnQRBN]?$/i.test(move);
}

/**
 * Minimal VariationNode interface (compatible with @chessbeast/core)
 */
export interface DagNode {
  readonly nodeId: string;
  readonly fen: string;
  readonly ply: number;
  readonly sideToMove: 'w' | 'b';
  childEdges: string[];
  principalChildEdge?: string;
}

/**
 * Minimal VariationEdge interface (compatible with @chessbeast/core)
 */
export interface DagEdge {
  readonly edgeId: string;
  readonly fromNode: string;
  readonly toNode: string;
  readonly san: string;
  readonly uci: string;
  nags: string[];
  comment?: string;
  isPrincipal: boolean;
}

/**
 * Minimal VariationDAG interface
 */
export interface DagLike {
  getRoot(): DagNode;
  getNode(nodeId: string): DagNode | undefined;
  getEdge(edgeId: string): DagEdge | undefined;
}

/**
 * Options for DAG transformation
 */
export interface DagTransformerOptions {
  /** Maximum depth for variations (default: 3) */
  maxVariationDepth?: number;

  /** Maximum moves per variation (default: 40) */
  maxVariationMoves?: number;

  /** Include only principal variations (no side lines) (default: false) */
  principalOnly?: boolean;

  /** Comments indexed by ply */
  comments?: Map<number, string>;

  /** NAGs indexed by ply */
  nags?: Map<number, string[]>;
}

const DEFAULT_OPTIONS: Required<Omit<DagTransformerOptions, 'comments' | 'nags'>> = {
  maxVariationDepth: 3,
  maxVariationMoves: 40,
  principalOnly: false,
};

/**
 * Transform a VariationDAG into MoveInfo[] for PGN rendering
 *
 * @param dag - The variation DAG to transform
 * @param options - Transformation options
 * @returns Array of MoveInfo representing the game with variations
 */
export function transformDagToMoves(dag: DagLike, options: DagTransformerOptions = {}): MoveInfo[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const root = dag.getRoot();

  // Extract the principal path as the main line
  const mainLine = extractPrincipalPath(dag, root, opts);

  // Add variations at each move
  if (!opts.principalOnly) {
    attachVariations(dag, mainLine, opts, 0);
  }

  return mainLine;
}

/**
 * Extract the principal path from a DAG node
 */
function extractPrincipalPath(
  dag: DagLike,
  startNode: DagNode,
  opts: Required<Omit<DagTransformerOptions, 'comments' | 'nags'>> & DagTransformerOptions,
): MoveInfo[] {
  const moves: MoveInfo[] = [];
  let currentNode = startNode;
  let moveCount = 0;

  while (currentNode.principalChildEdge && moveCount < opts.maxVariationMoves) {
    const edge = dag.getEdge(currentNode.principalChildEdge);
    if (!edge) break;

    const childNode = dag.getNode(edge.toNode);
    if (!childNode) break;

    const moveInfo = edgeToMoveInfo(edge, currentNode, childNode, opts);
    moves.push(moveInfo);

    currentNode = childNode;
    moveCount++;
  }

  return moves;
}

/**
 * Convert a DAG edge to MoveInfo
 */
function edgeToMoveInfo(
  edge: DagEdge,
  fromNode: DagNode,
  toNode: DagNode,
  opts: DagTransformerOptions,
): MoveInfo {
  // Calculate move number based on ply
  const isWhiteMove = fromNode.sideToMove === 'w';
  const moveNumber = Math.floor(fromNode.ply / 2) + 1;

  // Validate SAN - ensure it's not UCI format
  // After performance fix PR, upstream should always provide proper SAN - this check catches bugs
  let san = edge.san;
  if (san && isUciFormat(san)) {
    // DEPRECATED: This conversion should not be needed after upstream fixes
    // Log warning to catch any remaining DAG corruption
    console.warn(
      `[DAG Transformer] PERFORMANCE WARNING: UCI leak in edge.san="${edge.san}" ` +
        `at ply ${fromNode.ply}, move ${moveNumber}${isWhiteMove ? '.' : '...'}, ` +
        `FEN: ${fromNode.fen}. This triggers expensive position creation. Fix upstream!`,
    );
    try {
      const pos = new ChessPosition(fromNode.fen);
      san = pos.uciToSan(san);
    } catch (e) {
      // Log detailed error - this is a CRITICAL bug that must be fixed upstream
      console.error(
        `[DAG Transformer] CRITICAL BUG: Failed to convert UCI "${edge.san}" to SAN ` +
          `at ply ${fromNode.ply}, move ${moveNumber}${isWhiteMove ? '.' : '...'}, ` +
          `FEN: ${fromNode.fen}. Error: ${e}`,
      );
      // Keep original UCI - PGN will still be readable, but malformed
    }
  }

  const moveInfo: MoveInfo = {
    moveNumber,
    san,
    isWhiteMove,
    fenBefore: fromNode.fen,
    fenAfter: toNode.fen,
  };

  // Attach comment from pipeline results (by ply of target position)
  const comment = opts.comments?.get(toNode.ply);
  if (comment !== undefined) {
    moveInfo.commentAfter = comment;
  } else if (edge.comment !== undefined) {
    // Fall back to edge comment if no pipeline comment
    moveInfo.commentAfter = edge.comment;
  }

  // Attach NAGs from pipeline results
  const nagsFromPipeline = opts.nags?.get(toNode.ply);
  if (nagsFromPipeline && nagsFromPipeline.length > 0) {
    moveInfo.nags = [...nagsFromPipeline];
  } else if (edge.nags.length > 0) {
    // Fall back to edge NAGs if no pipeline NAGs
    moveInfo.nags = [...edge.nags];
  }

  return moveInfo;
}

/**
 * Attach variations to moves in the main line
 */
function attachVariations(
  dag: DagLike,
  moves: MoveInfo[],
  opts: Required<Omit<DagTransformerOptions, 'comments' | 'nags'>> & DagTransformerOptions,
  depth: number,
): void {
  if (depth >= opts.maxVariationDepth) return;

  // We need to reconstruct node references from the moves
  // Start with the root and follow the principal path
  const root = dag.getRoot();
  let currentNode = root;

  for (const move of moves) {
    // Find the edge that matches this move
    const principalEdge = currentNode.principalChildEdge
      ? dag.getEdge(currentNode.principalChildEdge)
      : undefined;

    if (!principalEdge) break;

    // Collect non-principal child edges as variations
    const variations: MoveInfo[][] = [];

    for (const edgeId of currentNode.childEdges) {
      if (edgeId === currentNode.principalChildEdge) continue;

      const edge = dag.getEdge(edgeId);
      if (!edge) continue;

      const childNode = dag.getNode(edge.toNode);
      if (!childNode) continue;

      // Build variation starting from this alternative edge
      const variation = buildVariation(dag, edge, currentNode, childNode, opts, depth + 1);
      if (variation.length > 0) {
        variations.push(variation);
      }
    }

    // Filter out empty/meaningless variations
    // A variation is meaningful if it has explanatory content or NAGs indicating quality
    const meaningfulVariations = variations.filter((variation) => {
      if (variation.length === 0) return false;
      const firstMove = variation[0]!;
      // Keep if has comment, NAGs (indicating move quality), or nested variations
      return (
        firstMove.commentAfter !== undefined ||
        (firstMove.nags !== undefined && firstMove.nags.length > 0) ||
        (firstMove.variations !== undefined && firstMove.variations.length > 0)
      );
    });

    if (meaningfulVariations.length > 0) {
      move.variations = meaningfulVariations;
    }

    // Move to next node
    const nextNode = dag.getNode(principalEdge.toNode);
    if (!nextNode) break;
    currentNode = nextNode;
  }
}

/**
 * Build a variation from an alternative edge
 */
function buildVariation(
  dag: DagLike,
  startEdge: DagEdge,
  fromNode: DagNode,
  toNode: DagNode,
  opts: Required<Omit<DagTransformerOptions, 'comments' | 'nags'>> & DagTransformerOptions,
  depth: number,
): MoveInfo[] {
  const variation: MoveInfo[] = [];

  // Add the first move (the alternative)
  const firstMove = edgeToMoveInfo(startEdge, fromNode, toNode, opts);
  variation.push(firstMove);

  // Continue with principal path from this node
  let currentNode = toNode;
  let moveCount = 1;

  while (currentNode.principalChildEdge && moveCount < opts.maxVariationMoves) {
    const edge = dag.getEdge(currentNode.principalChildEdge);
    if (!edge) break;

    const childNode = dag.getNode(edge.toNode);
    if (!childNode) break;

    const moveInfo = edgeToMoveInfo(edge, currentNode, childNode, opts);
    variation.push(moveInfo);

    currentNode = childNode;
    moveCount++;
  }

  // Recursively attach sub-variations if not at max depth
  if (depth < opts.maxVariationDepth && variation.length > 0) {
    attachVariationsToLine(dag, variation, toNode, opts, depth);
  }

  return variation;
}

/**
 * Attach variations to moves in a variation line
 */
function attachVariationsToLine(
  dag: DagLike,
  moves: MoveInfo[],
  startNode: DagNode,
  opts: Required<Omit<DagTransformerOptions, 'comments' | 'nags'>> & DagTransformerOptions,
  depth: number,
): void {
  if (depth >= opts.maxVariationDepth) return;

  let currentNode = startNode;

  for (const move of moves) {
    // Skip the first move as it's the variation start and is handled separately
    const principalEdge = currentNode.principalChildEdge
      ? dag.getEdge(currentNode.principalChildEdge)
      : undefined;

    // Collect non-principal child edges
    const variations: MoveInfo[][] = [];

    for (const edgeId of currentNode.childEdges) {
      if (edgeId === currentNode.principalChildEdge) continue;

      const edge = dag.getEdge(edgeId);
      if (!edge) continue;

      const childNode = dag.getNode(edge.toNode);
      if (!childNode) continue;

      const subVariation = buildVariation(dag, edge, currentNode, childNode, opts, depth + 1);
      if (subVariation.length > 0) {
        variations.push(subVariation);
      }
    }

    if (variations.length > 0) {
      move.variations = move.variations ?? [];
      move.variations.push(...variations);
    }

    // Move to next node via principal edge
    if (principalEdge) {
      const nextNode = dag.getNode(principalEdge.toNode);
      if (nextNode) {
        currentNode = nextNode;
      }
    }
  }
}

/**
 * Count the total number of moves in a DAG
 */
export function countDagMoves(dag: DagLike): number {
  const visited = new Set<string>();
  let count = 0;

  const root = dag.getRoot();

  function traverse(node: DagNode): void {
    if (visited.has(node.nodeId)) return;
    visited.add(node.nodeId);

    for (const edgeId of node.childEdges) {
      const edge = dag.getEdge(edgeId);
      if (!edge) continue;

      count++;

      const childNode = dag.getNode(edge.toNode);
      if (childNode) {
        traverse(childNode);
      }
    }
  }

  traverse(root);
  return count;
}

/**
 * Get the principal variation as a list of SAN moves
 */
export function getPrincipalVariation(dag: DagLike): string[] {
  const pv: string[] = [];
  let currentNode = dag.getRoot();

  while (currentNode.principalChildEdge) {
    const edge = dag.getEdge(currentNode.principalChildEdge);
    if (!edge) break;

    pv.push(edge.san);

    const childNode = dag.getNode(edge.toNode);
    if (!childNode) break;

    currentNode = childNode;
  }

  return pv;
}
