/**
 * Tree-based Exploration State Management
 *
 * Tracks the current state of variation exploration, supporting:
 * - Move navigation (push/pop)
 * - Branching into sub-variations
 * - Annotations (comments and NAGs) on moves
 * - Conversion to ExploredLine output format
 */

import type {
  LinePurpose,
  LineSource,
  ExploredLine,
  EngineEvaluation,
} from './variation-explorer.js';

/**
 * A single explored move with its annotations
 */
export interface ExploredMove {
  san: string;
  fenAfter: string;
  comment?: string;
  nag?: string;
  evaluation?: EngineEvaluation;
}

/**
 * A branch (variation) containing moves and sub-branches
 */
export interface ExploredBranch {
  moves: ExploredMove[];
  /** Sub-variations branching from specific move indices */
  branches: Map<number, ExploredBranch[]>;
  purpose: LinePurpose;
  source: LineSource;
  /** FEN at the start of this branch */
  startingFen: string;
}

/**
 * Manages the state of agentic variation exploration
 *
 * Supports:
 * - Linear move navigation (push/pop)
 * - Branching into sub-variations at any point
 * - Adding comments and NAGs to the current move
 * - Tracking evaluation at current position
 * - Converting to ExploredLine[] for output
 */
export class ExplorationState {
  /** Root branch containing the main line */
  private root: ExploredBranch;

  /** Stack of branch references for nested exploration */
  private branchStack: ExploredBranch[];

  /** Total branches created (for limiting) */
  private branchCount: number = 0;

  constructor(startingFen: string) {
    this.root = {
      moves: [],
      branches: new Map(),
      purpose: 'best',
      source: 'engine',
      startingFen,
    };
    this.branchStack = [this.root];
  }

  /**
   * Get the current branch being explored
   */
  private getCurrentBranch(): ExploredBranch {
    return this.branchStack[this.branchStack.length - 1]!;
  }

  /**
   * Push a move onto the current branch
   */
  pushMove(move: ExploredMove): void {
    const branch = this.getCurrentBranch();
    branch.moves.push(move);
  }

  /**
   * Pop the last move from the current branch
   */
  popMove(): ExploredMove | undefined {
    const branch = this.getCurrentBranch();
    if (branch.moves.length === 0) {
      return undefined;
    }
    return branch.moves.pop();
  }

  /**
   * Start a new sub-variation from the current position
   *
   * The branch starts from the current move index (after the last pushed move).
   * When you push moves after starting a branch, they go into the new branch.
   */
  startBranch(purpose: LinePurpose, source: LineSource = 'llm'): void {
    const currentBranch = this.getCurrentBranch();
    const branchIndex = currentBranch.moves.length;

    // Create new branch
    const newBranch: ExploredBranch = {
      moves: [],
      branches: new Map(),
      purpose,
      source,
      startingFen: this.getCurrentFen(),
    };

    // Add to current branch's sub-variations
    if (!currentBranch.branches.has(branchIndex)) {
      currentBranch.branches.set(branchIndex, []);
    }
    currentBranch.branches.get(branchIndex)!.push(newBranch);

    // Push onto stack
    this.branchStack.push(newBranch);
    this.branchCount++;
  }

  /**
   * End the current sub-variation and return to parent branch
   */
  endBranch(): boolean {
    if (this.branchStack.length <= 1) {
      // Can't pop root
      return false;
    }
    this.branchStack.pop();
    return true;
  }

  /**
   * Add a comment to the last move in the current branch
   */
  addComment(comment: string): boolean {
    const branch = this.getCurrentBranch();
    if (branch.moves.length === 0) {
      return false;
    }
    const lastMove = branch.moves[branch.moves.length - 1]!;
    if (lastMove.comment) {
      // Append to existing comment
      lastMove.comment = `${lastMove.comment} ${comment}`;
    } else {
      lastMove.comment = comment;
    }
    return true;
  }

  /**
   * Add a NAG symbol to the last move in the current branch
   */
  addNag(nag: string): boolean {
    const branch = this.getCurrentBranch();
    if (branch.moves.length === 0) {
      return false;
    }
    const lastMove = branch.moves[branch.moves.length - 1]!;
    lastMove.nag = nag;
    return true;
  }

  /**
   * Set evaluation for the last move
   */
  setEvaluation(evaluation: EngineEvaluation): boolean {
    const branch = this.getCurrentBranch();
    if (branch.moves.length === 0) {
      return false;
    }
    const lastMove = branch.moves[branch.moves.length - 1]!;
    lastMove.evaluation = evaluation;
    return true;
  }

  /**
   * Get the current position FEN
   */
  getCurrentFen(): string {
    const branch = this.getCurrentBranch();
    if (branch.moves.length === 0) {
      return branch.startingFen;
    }
    return branch.moves[branch.moves.length - 1]!.fenAfter;
  }

  /**
   * Get the depth of the current branch (number of moves played)
   */
  getCurrentDepth(): number {
    let depth = 0;
    for (const branch of this.branchStack) {
      depth += branch.moves.length;
    }
    return depth;
  }

  /**
   * Get the number of branches created
   */
  getBranchCount(): number {
    return this.branchCount;
  }

  /**
   * Get move history as SAN strings (for LLM context)
   */
  getMoveHistory(): string[] {
    const history: string[] = [];
    for (const branch of this.branchStack) {
      for (const move of branch.moves) {
        history.push(move.san);
      }
    }
    return history;
  }

  /**
   * Get nesting depth (how many sub-variations deep we are)
   */
  getNestingDepth(): number {
    return this.branchStack.length - 1;
  }

  /**
   * Convert exploration state to ExploredLine[] format
   *
   * This produces output compatible with the existing variation transformer.
   */
  toExploredLines(): ExploredLine[] {
    return this.branchToExploredLines(this.root);
  }

  /**
   * Recursively convert a branch to ExploredLine[]
   */
  private branchToExploredLines(branch: ExploredBranch): ExploredLine[] {
    if (branch.moves.length === 0) {
      return [];
    }

    // Build annotations map from comments
    const annotations = new Map<number, string>();
    for (let i = 0; i < branch.moves.length; i++) {
      const move = branch.moves[i]!;
      if (move.comment) {
        annotations.set(i, move.comment);
      }
    }

    // Build nested branches
    const nestedBranches: ExploredLine[] = [];
    for (const [_moveIndex, subBranches] of branch.branches) {
      for (const subBranch of subBranches) {
        const subLines = this.branchToExploredLines(subBranch);
        nestedBranches.push(...subLines);
      }
    }

    // Get final evaluation if present
    const lastMove = branch.moves[branch.moves.length - 1];
    const finalEval = lastMove?.evaluation;

    const line: ExploredLine = {
      moves: branch.moves.map((m) => m.san),
      annotations,
      branches: nestedBranches,
      purpose: branch.purpose,
      source: branch.source,
    };

    if (finalEval) {
      line.finalEval = finalEval;
    }

    return [line];
  }
}
