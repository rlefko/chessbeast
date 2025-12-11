/**
 * Variation DAG Manager
 *
 * Manages the variation DAG with full transposition support.
 * Provides navigation, modification, and serialization capabilities.
 */

import { ChessPosition } from '@chessbeast/pgn';

import { generatePositionKey } from '../position-key.js';

import type { EdgeSource, VariationEdge } from './edge.js';
import { createVariationEdge, generateEdgeId, setPrincipal } from './edge.js';
import type { NodeSource, NodeId, EdgeId, VariationNode } from './node.js';
import { createVariationNode, generateNodeId, visitNode, isTransposition } from './node.js';

/**
 * Result of adding a move to the DAG
 */
export interface AddMoveResult {
  /** The target node (new or existing) */
  node: VariationNode;

  /** The edge connecting parent to target */
  edge: VariationEdge;

  /** Whether this was a transposition to an existing node */
  isTransposition: boolean;

  /** Whether a new node was created */
  isNewNode: boolean;
}

/**
 * Navigation result
 */
export interface NavigationResult {
  /** Whether navigation succeeded */
  success: boolean;

  /** Current node after navigation (if successful) */
  node?: VariationNode;

  /** Error message (if failed) */
  error?: string;
}

/**
 * Path through the DAG (sequence of edges)
 */
export interface DagPath {
  /** Edge IDs in order */
  edges: EdgeId[];

  /** Node IDs in order (including start and end) */
  nodes: NodeId[];

  /** Total depth (number of moves) */
  length: number;
}

/**
 * Manager for the variation DAG with transposition support
 */
export class VariationDAG {
  /** All nodes indexed by nodeId */
  private nodes: Map<NodeId, VariationNode> = new Map();

  /** All edges indexed by edgeId */
  private edges: Map<EdgeId, VariationEdge> = new Map();

  /** Position index for transposition detection: positionKey -> nodeIds */
  private positionIndex: Map<string, NodeId[]> = new Map();

  /** Current node ID for navigation */
  private currentNodeId: NodeId;

  /** Root node ID */
  private readonly rootNodeId: NodeId;

  /**
   * Create a new VariationDAG with a root position
   *
   * @param rootFen - FEN of the starting position
   */
  constructor(rootFen: string) {
    const positionKey = generatePositionKey(rootFen);
    const rootNode = this.createNode(rootFen, positionKey.key, 0, 'mainline');
    this.rootNodeId = rootNode.nodeId;
    this.currentNodeId = rootNode.nodeId;
  }

  /**
   * Get the root node
   */
  getRoot(): VariationNode {
    return this.nodes.get(this.rootNodeId)!;
  }

  /**
   * Get the current node
   */
  getCurrentNode(): VariationNode {
    return this.nodes.get(this.currentNodeId)!;
  }

  /**
   * Get a node by ID
   */
  getNode(nodeId: NodeId): VariationNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get an edge by ID
   */
  getEdge(edgeId: EdgeId): VariationEdge | undefined {
    return this.edges.get(edgeId);
  }

  /**
   * Find existing node for a position (transposition detection)
   */
  findNodeByPositionKey(positionKey: string): VariationNode | undefined {
    const nodeIds = this.positionIndex.get(positionKey);
    if (!nodeIds || nodeIds.length === 0) return undefined;

    // Prefer nodes on principal path
    for (const nodeId of nodeIds) {
      const node = this.nodes.get(nodeId);
      if (node && this.isOnPrincipalPath(nodeId)) {
        return node;
      }
    }

    // Return first node as fallback
    return this.nodes.get(nodeIds[0]!);
  }

  /**
   * Add a move from the current position
   *
   * @param san - Move in SAN notation
   * @param uci - Move in UCI notation
   * @param resultingFen - FEN after the move
   * @param source - How this move was found
   * @param options - Additional options
   */
  addMove(
    san: string,
    uci: string,
    resultingFen: string,
    source: EdgeSource = 'exploration',
    options?: {
      makePrincipal?: boolean;
      navigateToChild?: boolean;
    },
  ): AddMoveResult {
    const currentNode = this.getCurrentNode();
    const resultingPositionKey = generatePositionKey(resultingFen);

    // Ensure san is proper SAN notation, not UCI
    // UCI format: 4-5 chars like "e2e4" or "e7e8q" (with optional promotion piece)
    let sanMove = san;
    if (san && /^[a-h][1-8][a-h][1-8][qrbnQRBN]?$/i.test(san)) {
      // san parameter is actually UCI, try to convert it
      try {
        const position = new ChessPosition(currentNode.fen);
        sanMove = position.uciToSan(san);
        // If uci param is empty, populate it with the original UCI
        if (!uci) {
          uci = san;
        }
      } catch {
        // Move is illegal in this position - this is a bug upstream
        // Callers must validate moves before adding to DAG
        console.error(
          `[DAG] CRITICAL: Illegal UCI move "${san}" at position ${currentNode.fen.split(' ')[0]}. ` +
            `This indicates a bug in the caller - moves should be validated before adding to DAG.`,
        );
        throw new Error(
          `Illegal move "${san}" cannot be added to DAG at position ${currentNode.fen}`,
        );
      }
    }

    // Check for existing edge with this move
    for (const edgeId of currentNode.childEdges) {
      const edge = this.edges.get(edgeId)!;
      if (edge.san === sanMove || edge.uci === uci) {
        const targetNode = this.nodes.get(edge.toNode)!;
        visitNode(targetNode);

        if (options?.navigateToChild !== false) {
          this.currentNodeId = targetNode.nodeId;
        }

        return {
          node: targetNode,
          edge,
          isTransposition: false,
          isNewNode: false,
        };
      }
    }

    // Check for transposition to existing node
    const existingNode = this.findNodeByPositionKey(resultingPositionKey.key);
    if (existingNode) {
      // Create edge to existing node (transposition)
      const edge = this.createEdge(currentNode.nodeId, existingNode.nodeId, sanMove, uci, source);

      existingNode.parentEdges.push(edge.edgeId);
      currentNode.childEdges.push(edge.edgeId);
      visitNode(existingNode);

      // Handle principal
      if (options?.makePrincipal || !currentNode.principalChildEdge) {
        this.setPrincipalChild(currentNode, edge.edgeId);
      }

      if (options?.navigateToChild !== false) {
        this.currentNodeId = existingNode.nodeId;
      }

      return {
        node: existingNode,
        edge,
        isTransposition: true,
        isNewNode: false,
      };
    }

    // Create new node
    const newNode = this.createNode(
      resultingFen,
      resultingPositionKey.key,
      currentNode.ply + 1,
      source === 'mainline' ? 'mainline' : 'exploration',
    );

    const edge = this.createEdge(currentNode.nodeId, newNode.nodeId, sanMove, uci, source);

    newNode.parentEdges.push(edge.edgeId);
    currentNode.childEdges.push(edge.edgeId);

    // Handle principal
    if (options?.makePrincipal || !currentNode.principalChildEdge) {
      this.setPrincipalChild(currentNode, edge.edgeId);
    }

    if (options?.navigateToChild !== false) {
      this.currentNodeId = newNode.nodeId;
    }

    return {
      node: newNode,
      edge,
      isTransposition: false,
      isNewNode: true,
    };
  }

  /**
   * Add an alternative move (sibling of current node's children)
   * Does not navigate to the new node
   */
  addAlternative(
    san: string,
    uci: string,
    resultingFen: string,
    source: EdgeSource = 'exploration',
  ): AddMoveResult {
    return this.addMove(san, uci, resultingFen, source, {
      makePrincipal: false,
      navigateToChild: false,
    });
  }

  /**
   * Navigate to a node by FEN
   */
  goToFen(fen: string): NavigationResult {
    const positionKey = generatePositionKey(fen);
    const node = this.findNodeByPositionKey(positionKey.key);

    if (!node) {
      return {
        success: false,
        error: `Position not found in tree: ${positionKey.normalizedFen}`,
      };
    }

    this.currentNodeId = node.nodeId;
    visitNode(node);

    return { success: true, node };
  }

  /**
   * Navigate to a node by ID
   */
  goToNode(nodeId: NodeId): NavigationResult {
    const node = this.nodes.get(nodeId);

    if (!node) {
      return {
        success: false,
        error: `Node not found: ${nodeId}`,
      };
    }

    this.currentNodeId = nodeId;
    visitNode(node);

    return { success: true, node };
  }

  /**
   * Navigate to parent node
   */
  goToParent(): NavigationResult {
    const current = this.getCurrentNode();

    if (current.parentEdges.length === 0) {
      return {
        success: false,
        error: 'Already at root node',
      };
    }

    // Find principal parent (edge where this node is the principal child)
    for (const edgeId of current.parentEdges) {
      const edge = this.edges.get(edgeId)!;
      const parentNode = this.nodes.get(edge.fromNode)!;

      if (parentNode.principalChildEdge === edgeId) {
        this.currentNodeId = parentNode.nodeId;
        visitNode(parentNode);
        return { success: true, node: parentNode };
      }
    }

    // Fallback to first parent
    const firstEdge = this.edges.get(current.parentEdges[0]!)!;
    const parentNode = this.nodes.get(firstEdge.fromNode)!;
    this.currentNodeId = parentNode.nodeId;
    visitNode(parentNode);

    return { success: true, node: parentNode };
  }

  /**
   * Navigate to root
   */
  goToRoot(): NavigationResult {
    return this.goToNode(this.rootNodeId);
  }

  /**
   * Get all paths to a node (for understanding move orders)
   */
  getPathsToNode(nodeId: NodeId, maxPaths: number = 5): DagPath[] {
    const paths: DagPath[] = [];
    const node = this.nodes.get(nodeId);
    if (!node) return paths;

    const dfs = (currentNodeId: NodeId, currentPath: EdgeId[]): void => {
      if (paths.length >= maxPaths) return;

      const current = this.nodes.get(currentNodeId)!;

      if (current.parentEdges.length === 0) {
        // Reached root
        const reversedEdges = [...currentPath].reverse();
        const nodeIds = [this.rootNodeId];

        for (const edgeId of reversedEdges) {
          const edge = this.edges.get(edgeId)!;
          nodeIds.push(edge.toNode);
        }

        paths.push({
          edges: reversedEdges,
          nodes: nodeIds,
          length: reversedEdges.length,
        });
        return;
      }

      for (const edgeId of current.parentEdges) {
        const edge = this.edges.get(edgeId)!;
        dfs(edge.fromNode, [...currentPath, edgeId]);
      }
    };

    dfs(nodeId, []);
    return paths;
  }

  /**
   * Get the principal path from root to a leaf
   */
  getPrincipalPath(): DagPath {
    const edges: EdgeId[] = [];
    const nodes: NodeId[] = [this.rootNodeId];

    let current = this.getRoot();
    while (current.principalChildEdge) {
      const edge = this.edges.get(current.principalChildEdge)!;
      edges.push(edge.edgeId);
      nodes.push(edge.toNode);
      current = this.nodes.get(edge.toNode)!;
    }

    return { edges, nodes, length: edges.length };
  }

  /**
   * Check if a node is on the principal path
   */
  isOnPrincipalPath(nodeId: NodeId): boolean {
    const principalPath = this.getPrincipalPath();
    return principalPath.nodes.includes(nodeId);
  }

  /**
   * Set the principal child of a node
   */
  setPrincipalChild(node: VariationNode, edgeId: EdgeId): void {
    // Clear old principal
    if (node.principalChildEdge) {
      const oldEdge = this.edges.get(node.principalChildEdge);
      if (oldEdge) {
        setPrincipal(oldEdge, false);
      }
    }

    // Set new principal
    node.principalChildEdge = edgeId;
    const newEdge = this.edges.get(edgeId);
    if (newEdge) {
      setPrincipal(newEdge, true);
    }
  }

  /**
   * Get statistics about the DAG
   */
  getStats(): {
    nodeCount: number;
    edgeCount: number;
    transpositionCount: number;
    maxDepth: number;
  } {
    let transpositionCount = 0;
    let maxDepth = 0;

    for (const node of this.nodes.values()) {
      if (isTransposition(node)) {
        transpositionCount++;
      }
      if (node.ply > maxDepth) {
        maxDepth = node.ply;
      }
    }

    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      transpositionCount,
      maxDepth,
    };
  }

  /**
   * Get an ASCII representation of the tree (for debugging)
   */
  getAsciiTree(maxDepth: number = 10): string {
    const lines: string[] = [];

    const printNode = (nodeId: NodeId, prefix: string, isLast: boolean, depth: number): void => {
      if (depth > maxDepth) return;

      const node = this.nodes.get(nodeId)!;
      const marker = isLast ? '└─' : '├─';
      const nodeStr = depth === 0 ? '[root]' : '';

      lines.push(`${prefix}${marker}${nodeStr} (${node.fen.split(' ')[0]?.substring(0, 20)}...)`);

      const childPrefix = prefix + (isLast ? '  ' : '│ ');
      const childEdges = node.childEdges;

      childEdges.forEach((edgeId, index) => {
        const edge = this.edges.get(edgeId)!;
        const childNode = this.nodes.get(edge.toNode)!;
        const isPrincipal = node.principalChildEdge === edgeId;
        const edgeStr = `${edge.san}${isPrincipal ? '*' : ''}`;

        lines.push(`${childPrefix}${edgeStr}`);
        printNode(childNode.nodeId, childPrefix, index === childEdges.length - 1, depth + 1);
      });
    };

    printNode(this.rootNodeId, '', true, 0);
    return lines.join('\n');
  }

  /**
   * Create a node and register it
   */
  private createNode(
    fen: string,
    positionKey: string,
    ply: number,
    source: NodeSource,
  ): VariationNode {
    const node = createVariationNode(generateNodeId(), positionKey, fen, ply, source);

    this.nodes.set(node.nodeId, node);

    // Add to position index
    const existing = this.positionIndex.get(positionKey) ?? [];
    existing.push(node.nodeId);
    this.positionIndex.set(positionKey, existing);

    return node;
  }

  /**
   * Create an edge and register it
   */
  private createEdge(
    fromNode: NodeId,
    toNode: NodeId,
    san: string,
    uci: string,
    source: EdgeSource,
  ): VariationEdge {
    const edge = createVariationEdge(generateEdgeId(), fromNode, toNode, san, uci, source);

    this.edges.set(edge.edgeId, edge);
    return edge;
  }
}

/**
 * Create a new VariationDAG from the starting position
 */
export function createVariationDAG(
  startingFen: string = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
): VariationDAG {
  return new VariationDAG(startingFen);
}
