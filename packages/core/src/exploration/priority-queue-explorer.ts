/**
 * Priority Queue Explorer
 *
 * Explores chess variations using a priority queue to focus on
 * the most interesting/critical positions first. Integrates with
 * the artifact cache for efficient transposition handling.
 */

import { ChessPosition } from '@chessbeast/pgn';

import { recommendMultipv } from '../classifier/adaptive-multipv.js';
import { calculateCriticality } from '../classifier/criticality-scorer.js';
import type { EngineService, EvaluationOptions } from '../pipeline/analysis-pipeline.js';
import type { AnalysisTier } from '../storage/artifacts/base.js';
import { getTierConfig } from '../storage/artifacts/base.js';
import { createEngineEvalArtifact, type PVLine } from '../storage/artifacts/engine-eval.js';
import type { ArtifactCache } from '../storage/cache/artifact-cache.js';
import { generatePositionKey } from '../storage/position-key.js';
import type { VariationDAG } from '../storage/variation-dag/dag-manager.js';
import type { EngineEvaluation } from '../types/analysis.js';

import {
  type ExplorationNode,
  createExplorationNode,
  compareByPriority,
  markExplored,
  updateCriticality,
  generateNodeId,
  promoteTier,
} from './exploration-node.js';
import { PriorityQueue } from './priority-queue.js';
import {
  type StoppingConfig,
  type StoppingReason,
  type ExplorationState,
  DEFAULT_STOPPING_CONFIG,
  shouldStop,
  createInitialState,
  updateState,
  addEvalToHistory,
} from './stopping-conditions.js';

/**
 * Check if a move string is in UCI format (e.g., "e2e4", "e7e8q")
 * UCI moves are 4-5 characters: source square + target square + optional promotion
 */
function isUciFormat(move: string): boolean {
  return /^[a-h][1-8][a-h][1-8][qrbnQRBN]?$/i.test(move);
}

/**
 * Configuration for the priority queue explorer
 */
export interface ExplorerConfig {
  /** Artifact cache for storing/retrieving analysis results */
  cache?: ArtifactCache;

  /** Variation DAG for building the exploration tree */
  dag?: VariationDAG;

  /** Maximum nodes to explore */
  maxNodes?: number;

  /** Maximum exploration depth */
  maxDepth?: number;

  /** Minimum priority to continue exploring */
  minPriority?: number;

  /** Time budget in milliseconds */
  budgetMs?: number;

  /** Engine version string */
  engineVersion?: string;

  /** Stopping configuration overrides */
  stoppingConfig?: Partial<StoppingConfig>;
}

/**
 * Result from exploration
 */
export interface ExplorationResult {
  /** Number of nodes explored */
  nodesExplored: number;

  /** Number of positions skipped (cache hits) */
  nodesSkipped: number;

  /** Maximum depth reached */
  maxDepthReached: number;

  /** Reason exploration stopped */
  stoppingReason: StoppingReason;

  /** Total time taken in milliseconds */
  timeMs: number;

  /** All explored nodes */
  exploredNodes: ExplorationNode[];

  /** Variations found (as move sequences) */
  variations: string[][];
}

/**
 * Candidate move for exploration
 */
export interface CandidateMove {
  /** Move in SAN notation */
  san: string;

  /** Move in UCI notation */
  uci: string;

  /** Resulting FEN after the move */
  resultingFen: string;

  /** Engine evaluation in centipawns */
  evalCp?: number;

  /** Priority score for exploration */
  priority?: number;
}

/**
 * Default explorer configuration
 */
const DEFAULT_EXPLORER_CONFIG: Required<Omit<ExplorerConfig, 'cache' | 'dag'>> = {
  maxNodes: 500,
  maxDepth: 40,
  minPriority: 10,
  budgetMs: 60000,
  engineVersion: 'stockfish-17',
  stoppingConfig: {},
};

/**
 * Priority Queue Explorer
 *
 * Explores variations using best-first search, prioritizing
 * the most critical/interesting positions.
 */
export class PriorityQueueExplorer {
  private readonly engine: EngineService;
  private readonly cache?: ArtifactCache;
  private readonly dag?: VariationDAG;
  private readonly config: Required<Omit<ExplorerConfig, 'cache' | 'dag'>>;
  private readonly stoppingConfig: StoppingConfig;

  private queue: PriorityQueue<ExplorationNode>;
  private state: ExplorationState;
  private exploredNodes: Map<string, ExplorationNode>;
  private isPaused: boolean = false;
  private isStopped: boolean = false;

  // Callbacks
  private onNodeExploredCallback?: (node: ExplorationNode) => void;
  private onVariationCompleteCallback?: (moves: string[]) => void;

  constructor(engine: EngineService, config: ExplorerConfig = {}) {
    this.engine = engine;
    if (config.cache !== undefined) {
      this.cache = config.cache;
    }
    if (config.dag !== undefined) {
      this.dag = config.dag;
    }
    this.config = {
      ...DEFAULT_EXPLORER_CONFIG,
      ...config,
      stoppingConfig: { ...DEFAULT_EXPLORER_CONFIG.stoppingConfig, ...config.stoppingConfig },
    };

    this.stoppingConfig = {
      ...DEFAULT_STOPPING_CONFIG,
      maxNodes: this.config.maxNodes,
      maxDepth: this.config.maxDepth,
      minPriority: this.config.minPriority,
      budgetMs: this.config.budgetMs,
      ...this.config.stoppingConfig,
    };

    this.queue = new PriorityQueue<ExplorationNode>(compareByPriority);
    this.state = createInitialState();
    this.exploredNodes = new Map();
  }

  /**
   * Explore from a root position
   *
   * @param rootFen - Starting position FEN
   * @param candidates - Initial candidate moves to explore
   * @returns Exploration result
   */
  async explore(rootFen: string, candidates: CandidateMove[]): Promise<ExplorationResult> {
    const startTime = Date.now();
    this.reset();

    // Create root node
    const rootPosKey = generatePositionKey(rootFen);
    const rootNode = createExplorationNode(
      generateNodeId(rootPosKey.key, 0),
      rootPosKey.key,
      rootFen,
      0,
      0,
      { criticalityScore: 50 }, // Root has medium priority
    );
    markExplored(rootNode);
    this.exploredNodes.set(rootNode.positionKey, rootNode);

    // Add initial candidates to queue
    for (const candidate of candidates) {
      const childPosKey = generatePositionKey(candidate.resultingFen);
      const childNode = createExplorationNode(
        generateNodeId(childPosKey.key, 1),
        childPosKey.key,
        candidate.resultingFen,
        1,
        1,
        {
          criticalityScore: candidate.priority ?? 50,
          parentNodeId: rootNode.nodeId,
          parentMove: candidate.san,
          parentMoveUci: candidate.uci,
        },
      );
      this.queue.push(childNode);
    }

    // Main exploration loop
    while (!this.queue.isEmpty()) {
      // Check stopping conditions
      this.updateState(startTime);
      const stopCheck = shouldStop(this.state, this.stoppingConfig);
      if (stopCheck.stop) {
        return this.buildResult(startTime, stopCheck.reason!);
      }

      // Handle pause
      if (this.isPaused) {
        await this.waitForResume();
        continue;
      }

      // Handle stop
      if (this.isStopped) {
        return this.buildResult(startTime, 'user_stopped');
      }

      // Get highest priority node
      const node = this.queue.pop()!;

      // Skip if already explored (transposition)
      if (this.exploredNodes.has(node.positionKey)) {
        continue;
      }

      // Explore this node
      await this.exploreNode(node);
    }

    // Queue empty
    return this.buildResult(startTime, 'queue_empty');
  }

  /**
   * Explore a single node
   */
  private async exploreNode(node: ExplorationNode): Promise<void> {
    // Always count the node as explored when we process it
    // This ensures nodesExplored reflects actual work done, even if evaluation fails
    this.state.nodesExplored++;

    // Check cache first
    const cached = this.getCachedEval(node.positionKey, node.tier);
    let evalResult: EngineEvaluation | undefined;

    if (cached) {
      const result: EngineEvaluation = {
        depth: cached.depth,
        pv: cached.pvLines[0]?.movesUci ?? [],
      };
      if (cached.cp !== undefined) {
        result.cp = cached.cp;
      }
      if (cached.mate !== undefined) {
        result.mate = cached.mate;
      }
      evalResult = result;
    } else {
      // Compute evaluation
      evalResult = await this.evaluatePosition(node);
      if (evalResult) {
        // Cache the result
        this.cacheEval(node.positionKey, node.tier, evalResult);
      }
    }

    // Update node with evaluation
    if (evalResult) {
      const critScore = calculateCriticality(
        evalResult.cp ?? 0,
        -(evalResult.cp ?? 0), // After eval is from opponent's perspective
      );
      updateCriticality(node, critScore.score);

      // Maybe promote tier
      if (critScore.recommendedTier !== node.tier) {
        promoteTier(node, critScore.recommendedTier);
      }

      // Add to eval history for stability check
      addEvalToHistory(this.state, evalResult.cp ?? 0);
    }

    // Mark as explored
    markExplored(node);
    this.exploredNodes.set(node.positionKey, node);

    // Update max depth
    if (node.explorationDepth > this.state.maxDepthReached) {
      this.state.maxDepthReached = node.explorationDepth;
    }

    // Notify callback
    if (this.onNodeExploredCallback) {
      try {
        this.onNodeExploredCallback(node);
      } catch (callbackError) {
        console.error(
          `[PQE] Callback error: ${callbackError instanceof Error ? callbackError.message : String(callbackError)}`,
        );
      }
    }

    // Add children to queue (from PV line)
    if (
      evalResult?.pv &&
      evalResult.pv.length > 0 &&
      node.explorationDepth < this.config.maxDepth
    ) {
      await this.addChildrenFromPV(node, evalResult.pv, evalResult.pvUci);
    }
  }

  /**
   * Add child nodes from principal variation
   * @param parent - Parent node to add children to
   * @param pvSan - PV moves in SAN notation
   * @param pvUci - PV moves in UCI notation (parallel array, optional - avoids re-derivation)
   */
  private async addChildrenFromPV(
    parent: ExplorationNode,
    pvSan: string[],
    pvUci?: string[],
  ): Promise<void> {
    // Only explore the first few moves of the PV
    const maxPvMoves = 3;

    // We need the DAG for storing variations
    if (!this.dag) return;

    // Navigate the DAG to the parent position before adding moves
    // This ensures moves are added from the correct position in the tree
    const navResult = this.dag.goToFen(parent.fen);
    if (!navResult.success) {
      // Parent position not in DAG - skip adding PV moves
      return;
    }

    // Create position ONCE and reuse it by advancing through moves
    // This is the key optimization - avoids creating a new ChessPosition per PV move
    const position = new ChessPosition(parent.fen);

    for (let i = 0; i < Math.min(pvSan.length, maxPvMoves); i++) {
      const moveSan = pvSan[i]!;

      // Validate moveSan is proper SAN (not UCI format) - catch upstream bugs
      if (isUciFormat(moveSan)) {
        console.error(
          `[PQE] BUG: pvSan[${i}] "${moveSan}" is UCI format - upstream should provide SAN`,
        );
        break; // Position is invalid for further processing
      }

      try {
        // Use pre-computed UCI from engine adapter when available, otherwise derive once
        // The pvUci array should be parallel to pvSan - same index corresponds to same move
        const moveUci = pvUci?.[i] ?? position.sanToUci(moveSan);

        // Make the move to advance position for next iteration and get resulting FEN
        position.move(moveSan);
        const resultingFen = position.fen();

        const result = this.dag.addMove(
          moveSan, // Proper SAN notation for display
          moveUci, // UCI for internal reference
          resultingFen,
          'exploration',
        );

        if (result.isNewNode) {
          const childPosKey = generatePositionKey(result.node.fen);
          const childNode = createExplorationNode(
            generateNodeId(childPosKey.key, parent.explorationDepth + 1 + i),
            childPosKey.key,
            result.node.fen,
            parent.ply + 1 + i,
            parent.explorationDepth + 1 + i,
            {
              parentNodeId: parent.nodeId,
              parentMove: moveSan,
              parentMoveUci: moveUci,
              noveltyScore: 0.8 - i * 0.1, // Decreasing novelty for later PV moves
            },
          );
          this.queue.push(childNode);
        }
      } catch (e) {
        // Move processing errors are fatal for the rest of the PV - position is now invalid
        console.warn(
          `[PQE] Failed to process PV move "${moveSan}" at ply ${parent.ply + i}: ${e instanceof Error ? e.message : String(e)}`,
        );
        break;
      }
    }
  }

  /**
   * Evaluate a position
   */
  private async evaluatePosition(node: ExplorationNode): Promise<EngineEvaluation | undefined> {
    const tierConfig = getTierConfig(node.tier);
    const multipvRec = recommendMultipv(node.criticalityScore, node.tier);

    const options: EvaluationOptions = {
      depth: tierConfig.depth,
      timeLimitMs: tierConfig.timeLimitMs,
      numLines: multipvRec.multipv,
      mateMinTimeMs: tierConfig.mateMinTimeMs,
    };

    try {
      const evals = await this.engine.evaluateMultiPv(node.fen, options);
      return evals[0];
    } catch {
      return undefined;
    }
  }

  /**
   * Get cached evaluation
   */
  private getCachedEval(
    positionKey: string,
    tier: AnalysisTier,
  ): { cp?: number; mate?: number; depth: number; pvLines: PVLine[] } | undefined {
    if (!this.cache) return undefined;

    const artifact = this.cache.getEngineEvalForTier(positionKey, tier);
    if (!artifact) return undefined;

    const result: { cp?: number; mate?: number; depth: number; pvLines: PVLine[] } = {
      depth: artifact.depth,
      pvLines: artifact.pvLines,
    };
    if (artifact.cp !== undefined) {
      result.cp = artifact.cp;
    }
    if (artifact.mate !== undefined) {
      result.mate = artifact.mate;
    }
    return result;
  }

  /**
   * Cache an evaluation
   */
  private cacheEval(positionKey: string, tier: AnalysisTier, evalResult: EngineEvaluation): void {
    if (!this.cache) return;

    const pvLines: PVLine[] = [
      {
        cp: evalResult.cp ?? 0,
        mate: evalResult.mate ?? 0,
        movesUci: evalResult.pv ?? [],
      },
    ];

    const artifact = createEngineEvalArtifact(
      positionKey,
      tier,
      evalResult.depth,
      1,
      pvLines,
      this.config.engineVersion,
      'default',
      0,
    );

    this.cache.setEngineEval(artifact);
  }

  /**
   * Update exploration state
   */
  private updateState(startTime: number): void {
    updateState(this.state, {
      elapsedMs: Date.now() - startTime,
      queueEmpty: this.queue.isEmpty(),
      currentHighestPriority: this.queue.peek()?.explorationPriority ?? 0,
      userStopped: this.isStopped,
    });
  }

  /**
   * Build final exploration result
   */
  private buildResult(startTime: number, reason: StoppingReason): ExplorationResult {
    const exploredNodes = Array.from(this.exploredNodes.values());
    const variations = this.extractVariations(exploredNodes);

    return {
      nodesExplored: this.state.nodesExplored,
      nodesSkipped: exploredNodes.length - this.state.nodesExplored,
      maxDepthReached: this.state.maxDepthReached,
      stoppingReason: reason,
      timeMs: Date.now() - startTime,
      exploredNodes,
      variations,
    };
  }

  /**
   * Extract variations from explored nodes
   */
  private extractVariations(nodes: ExplorationNode[]): string[][] {
    const variations: string[][] = [];

    // Find leaf nodes (nodes with no children in our explored set)
    const parentIds = new Set(nodes.filter((n) => n.parentNodeId).map((n) => n.parentNodeId!));

    const leafNodes = nodes.filter((n) => !parentIds.has(n.nodeId) && n.explorationDepth > 0);

    // Build path to each leaf
    for (const leaf of leafNodes) {
      const variation: string[] = [];
      let current: ExplorationNode | undefined = leaf;

      while (current && current.parentMove) {
        variation.unshift(current.parentMove);
        current = current.parentNodeId ? this.exploredNodes.get(current.parentNodeId) : undefined;
      }

      if (variation.length > 0) {
        variations.push(variation);

        // Notify callback
        if (this.onVariationCompleteCallback) {
          this.onVariationCompleteCallback(variation);
        }
      }
    }

    return variations;
  }

  /**
   * Pause exploration
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume exploration
   */
  resume(): void {
    this.isPaused = false;
  }

  /**
   * Stop exploration
   */
  stop(): void {
    this.isStopped = true;
    this.isPaused = false; // Ensure we exit any wait loop
  }

  /**
   * Wait for resume (for pause functionality)
   */
  private async waitForResume(): Promise<void> {
    // Poll until resumed or stopped
    while (this.isPaused && !this.isStopped) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * Reset explorer state
   */
  private reset(): void {
    this.queue.clear();
    this.state = createInitialState();
    this.exploredNodes.clear();
    this.isPaused = false;
    this.isStopped = false;
  }

  /**
   * Set callback for node exploration
   */
  onNodeExplored(callback: (node: ExplorationNode) => void): void {
    this.onNodeExploredCallback = callback;
  }

  /**
   * Set callback for variation completion
   */
  onVariationComplete(callback: (moves: string[]) => void): void {
    this.onVariationCompleteCallback = callback;
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.queue.size;
  }

  /**
   * Get current state
   */
  getState(): ExplorationState {
    return { ...this.state };
  }
}

/**
 * Create a priority queue explorer
 */
export function createPriorityQueueExplorer(
  engine: EngineService,
  config?: ExplorerConfig,
): PriorityQueueExplorer {
  return new PriorityQueueExplorer(engine, config);
}
