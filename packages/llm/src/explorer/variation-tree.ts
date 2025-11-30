/**
 * Tree-based variation structure for agentic exploration.
 *
 * Each node represents a chess position with:
 * - Move that led to this position
 * - Metadata (comments, NAGs, engine eval)
 * - Children (alternative continuations)
 * - Principal child marker (main line)
 * - Interesting moves (work queue for exploration)
 */

import { ChessPosition } from '@chessbeast/pgn';
import type { MoveInfo } from '@chessbeast/pgn';

/**
 * Engine evaluation cached on a node
 */
export interface CachedEval {
  score: number; // Centipawns (positive = white advantage)
  depth: number;
  bestLine: string[];
  timestamp: number;
}

/**
 * A single node in the variation tree
 */
export interface VariationNode {
  // Identity
  id: string; // Internal unique ID
  fen: string; // Position after this move (used for navigation)

  // Move data
  san: string; // Move in SAN notation (empty for root)

  // Metadata
  comment?: string;
  nags: string[]; // Multiple NAGs allowed: ["$1", "$18"]

  // Work queue - moves to explore later
  interestingMoves: string[];

  // Engine cache
  engineEval?: CachedEval;

  // Tree structure
  children: VariationNode[];
  principalChild?: VariationNode;
  parent?: VariationNode;
}

/**
 * Result of a tree operation
 */
export interface TreeOperationResult {
  success: boolean;
  node?: VariationNode;
  error?: string;
  message?: string;
}

/**
 * Serializable node info returned to LLM
 */
export interface NodeInfo {
  fen: string;
  san: string;
  comment?: string;
  nags: string[];
  interestingMoves: string[];
  children: string[]; // SANs of child moves
  principalChild?: string; // SAN of principal child
  parentFen?: string;
  isOnPrincipalPath: boolean;
  engineEval?: CachedEval;
}

/**
 * Tree-based variation structure for exploration
 */
export class VariationTree {
  private root: VariationNode;
  private nodeMap: Map<string, VariationNode[]> = new Map(); // FEN -> nodes (multiple for transpositions)
  private currentNode: VariationNode;
  private nodeIdCounter = 0;

  constructor(startingFen: string) {
    this.root = this.createNode('', startingFen, undefined);
    this.currentNode = this.root;
  }

  /**
   * Create a new node with unique ID
   */
  private createNode(san: string, fen: string, parent?: VariationNode): VariationNode {
    const id = `n${this.nodeIdCounter++}`;
    const node: VariationNode = {
      id,
      fen,
      san,
      nags: [],
      interestingMoves: [],
      children: [],
      ...(parent && { parent }),
    };

    // Index by FEN
    const existing = this.nodeMap.get(fen) ?? [];
    existing.push(node);
    this.nodeMap.set(fen, existing);

    return node;
  }

  /**
   * Initialize tree with the game's main line
   */
  initializeFromMoves(moves: Array<{ san: string; fenAfter: string }>): void {
    let current = this.root;

    for (const move of moves) {
      const child = this.createNode(move.san, move.fenAfter, current);
      current.children.push(child);
      current.principalChild = child;
      current = child;
    }
  }

  /**
   * Get current node
   */
  getCurrentNode(): VariationNode {
    return this.currentNode;
  }

  /**
   * Get serializable info about current node
   */
  getCurrentNodeInfo(): NodeInfo {
    return this.nodeToInfo(this.currentNode);
  }

  /**
   * Convert node to serializable info
   */
  private nodeToInfo(node: VariationNode): NodeInfo {
    return {
      fen: node.fen,
      san: node.san,
      nags: node.nags,
      interestingMoves: node.interestingMoves,
      children: node.children.map((c) => c.san),
      isOnPrincipalPath: this.isOnPrincipalPath(node),
      ...(node.comment && { comment: node.comment }),
      ...(node.principalChild && { principalChild: node.principalChild.san }),
      ...(node.parent && { parentFen: node.parent.fen }),
      ...(node.engineEval && { engineEval: node.engineEval }),
    };
  }

  /**
   * Check if a node is on the principal path from root
   */
  private isOnPrincipalPath(node: VariationNode): boolean {
    let current: VariationNode | undefined = this.root;
    while (current) {
      if (current === node) return true;
      current = current.principalChild;
    }
    return false;
  }

  /**
   * Add a move as a child of current node and navigate to it
   */
  addMove(san: string): TreeOperationResult {
    // Check if this move already exists as a child
    const existingChild = this.currentNode.children.find((c) => c.san === san);
    if (existingChild) {
      this.currentNode = existingChild;
      return {
        success: true,
        node: existingChild,
        message: `Moved to existing node ${san}`,
      };
    }

    // Validate and make the move
    try {
      const pos = new ChessPosition(this.currentNode.fen);
      const result = pos.move(san);

      const child = this.createNode(result.san, result.fenAfter, this.currentNode);
      this.currentNode.children.push(child);

      // First child becomes principal by default
      if (!this.currentNode.principalChild) {
        this.currentNode.principalChild = child;
      }

      this.currentNode = child;
      return {
        success: true,
        node: child,
        message: `Added and moved to ${result.san}`,
      };
    } catch (e) {
      return {
        success: false,
        error: `Illegal move: ${san}`,
      };
    }
  }

  /**
   * Add an alternative move (sibling) but stay at current node.
   * At root, this acts like add_move but without navigating (adds a child).
   */
  addAlternative(san: string): TreeOperationResult {
    // At root: add as child instead of failing (graceful handling)
    if (!this.currentNode.parent) {
      // Check if this move already exists as a child
      const existingChild = this.currentNode.children.find((c) => c.san === san);
      if (existingChild) {
        return {
          success: true,
          node: existingChild,
          message: `Alternative ${san} already exists as a child. Use go_to to navigate to it.`,
        };
      }

      // Validate and make the move from current (root) position
      try {
        const pos = new ChessPosition(this.currentNode.fen);
        const result = pos.move(san);

        const child = this.createNode(result.san, result.fenAfter, this.currentNode);
        this.currentNode.children.push(child);

        return {
          success: true,
          node: child,
          message: `Added ${result.san} as alternative. Use go_to to navigate to it.`,
        };
      } catch (e) {
        return {
          success: false,
          error: `Illegal move: ${san}`,
        };
      }
    }

    const parent = this.currentNode.parent;

    // Check if this alternative already exists
    const existingSibling = parent.children.find((c) => c.san === san);
    if (existingSibling) {
      return {
        success: true,
        node: existingSibling,
        message: `Alternative ${san} already exists`,
      };
    }

    // Validate and make the move from parent position
    try {
      const pos = new ChessPosition(parent.fen);
      const result = pos.move(san);

      const sibling = this.createNode(result.san, result.fenAfter, parent);
      parent.children.push(sibling);

      return {
        success: true,
        node: sibling,
        message: `Added alternative ${result.san}. You remain at current position.`,
      };
    } catch (e) {
      return {
        success: false,
        error: `Illegal move: ${san}`,
      };
    }
  }

  /**
   * Navigate to a node by FEN
   */
  goTo(fen: string): TreeOperationResult {
    const nodes = this.nodeMap.get(fen);
    if (!nodes || nodes.length === 0) {
      return {
        success: false,
        error: `No node found with FEN: ${fen}`,
      };
    }

    // Prefer node on principal path if multiple
    const principalNode = nodes.find((n) => this.isOnPrincipalPath(n));
    const targetNode = principalNode ?? nodes[0]!;

    this.currentNode = targetNode;
    return {
      success: true,
      node: targetNode,
      message: `Navigated to position`,
    };
  }

  /**
   * Navigate to parent node
   */
  goToParent(): TreeOperationResult {
    if (!this.currentNode.parent) {
      return {
        success: false,
        error: 'Already at root',
      };
    }

    this.currentNode = this.currentNode.parent;
    return {
      success: true,
      node: this.currentNode,
      message: `Moved to parent`,
    };
  }

  /**
   * Set comment on current node
   */
  setComment(comment: string): void {
    this.currentNode.comment = comment;
  }

  /**
   * Add a NAG to current node
   */
  addNag(nag: string): void {
    if (!this.currentNode.nags.includes(nag)) {
      this.currentNode.nags.push(nag);
    }
  }

  /**
   * Set NAGs on current node (replaces existing)
   */
  setNags(nags: string[]): void {
    this.currentNode.nags = [...nags];
  }

  /**
   * Mark moves as interesting (to explore later)
   */
  markInteresting(moves: string[]): void {
    for (const move of moves) {
      if (!this.currentNode.interestingMoves.includes(move)) {
        this.currentNode.interestingMoves.push(move);
      }
    }
  }

  /**
   * Get interesting moves at current node
   */
  getInteresting(): string[] {
    return [...this.currentNode.interestingMoves];
  }

  /**
   * Clear a move from interesting list (after exploring)
   */
  clearInteresting(move: string): void {
    this.currentNode.interestingMoves = this.currentNode.interestingMoves.filter((m) => m !== move);
  }

  /**
   * Set a child as principal
   */
  setPrincipal(childSan: string): TreeOperationResult {
    const child = this.currentNode.children.find((c) => c.san === childSan);
    if (!child) {
      return {
        success: false,
        error: `No child with move ${childSan}`,
      };
    }

    this.currentNode.principalChild = child;
    return {
      success: true,
      message: `Set ${childSan} as principal continuation`,
    };
  }

  /**
   * Cache engine evaluation on current node
   */
  setEngineEval(eval_: CachedEval): void {
    this.currentNode.engineEval = eval_;
  }

  /**
   * Get ASCII tree visualization
   */
  getAsciiTree(): string {
    const lines: string[] = [];
    this.renderNode(this.root, '', true, lines);
    return lines.join('\n');
  }

  private renderNode(node: VariationNode, prefix: string, isLast: boolean, lines: string[]): void {
    const marker = node === this.currentNode ? ' ← YOU' : '';
    const principal = node.parent?.principalChild === node ? ' [P]' : '';
    const moveText = node.san || 'ROOT';

    lines.push(`${prefix}${isLast ? '└── ' : '├── '}${moveText}${principal}${marker}`);

    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    for (let i = 0; i < node.children.length; i++) {
      this.renderNode(node.children[i]!, childPrefix, i === node.children.length - 1, lines);
    }
  }

  /**
   * Convert tree to MoveInfo[] for PGN rendering.
   * Variations appear immediately after the move they're an alternative to.
   */
  toMoveInfo(): MoveInfo[] {
    if (this.root.children.length === 0) {
      return [];
    }

    // Find the principal path from root
    const principalPath = this.getPrincipalPath();
    if (principalPath.length === 0) {
      return [];
    }

    return this.buildMoveInfoFromPrincipalPath(principalPath);
  }

  /**
   * Get the principal path from root to leaf
   */
  private getPrincipalPath(): VariationNode[] {
    const path: VariationNode[] = [];
    let current = this.root.principalChild;

    while (current) {
      path.push(current);
      current = current.principalChild;
    }

    return path;
  }

  /**
   * Build MoveInfo array from principal path, attaching variations
   */
  private buildMoveInfoFromPrincipalPath(principalPath: VariationNode[]): MoveInfo[] {
    const moves: MoveInfo[] = [];

    for (let i = 0; i < principalPath.length; i++) {
      const node = principalPath[i]!;
      const parent = node.parent!;

      // Determine move number and color
      const fenParts = parent.fen.split(' ');
      const isWhiteMove = fenParts[1] === 'w';
      const moveNumber = parseInt(fenParts[5] ?? '1', 10);

      const moveInfo: MoveInfo = {
        moveNumber,
        san: node.san,
        isWhiteMove,
        fenBefore: parent.fen,
        fenAfter: node.fen,
        ...(node.comment && { commentAfter: node.comment }),
        ...(node.nags.length > 0 && { nags: node.nags }),
      };

      // Add non-principal siblings as variations
      const siblings = parent.children.filter((c) => c !== node);
      if (siblings.length > 0) {
        moveInfo.variations = siblings.map((sibling) => this.nodeToVariation(sibling, parent.fen));
      }

      moves.push(moveInfo);
    }

    return moves;
  }

  /**
   * Convert a subtree to a variation (MoveInfo[])
   */
  private nodeToVariation(node: VariationNode, parentFen: string): MoveInfo[] {
    const variation: MoveInfo[] = [];
    let current: VariationNode | undefined = node;
    let currentParentFen = parentFen;

    while (current) {
      const fenParts = currentParentFen.split(' ');
      const isWhiteMove = fenParts[1] === 'w';
      const moveNumber = parseInt(fenParts[5] ?? '1', 10);

      const moveInfo: MoveInfo = {
        moveNumber,
        san: current.san,
        isWhiteMove,
        fenBefore: currentParentFen,
        fenAfter: current.fen,
        ...(current.comment && { commentAfter: current.comment }),
        ...(current.nags.length > 0 && { nags: current.nags }),
      };

      // Add sub-variations for non-principal children
      if (current.children.length > 1 && current.principalChild) {
        const nonPrincipalChildren = current.children.filter((c) => c !== current!.principalChild);
        if (nonPrincipalChildren.length > 0) {
          moveInfo.variations = nonPrincipalChildren.map((child) =>
            this.nodeToVariation(child, current!.fen),
          );
        }
      }

      variation.push(moveInfo);

      // Continue along principal path or first child
      currentParentFen = current.fen;
      current = current.principalChild ?? current.children[0];
    }

    return variation;
  }

  /**
   * Get root node
   */
  getRoot(): VariationNode {
    return this.root;
  }

  /**
   * Get all nodes in tree
   */
  getAllNodes(): VariationNode[] {
    const nodes: VariationNode[] = [];
    this.collectNodes(this.root, nodes);
    return nodes;
  }

  private collectNodes(node: VariationNode, nodes: VariationNode[]): void {
    nodes.push(node);
    for (const child of node.children) {
      this.collectNodes(child, nodes);
    }
  }
}
