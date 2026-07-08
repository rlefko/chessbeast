import { ChessPosition, STARTING_FEN } from '@chessbeast/pgn';
import { describe, it, expect, afterEach, vi } from 'vitest';

import {
  createPriorityQueueExplorer,
  type CandidateMove,
} from '../exploration/priority-queue-explorer.js';
import type { EngineService, EvaluationOptions } from '../pipeline/analysis-pipeline.js';
import { createArtifactCache } from '../storage/cache/artifact-cache.js';
import { generatePositionKey } from '../storage/position-key.js';
import { createVariationDAG } from '../storage/variation-dag/dag-manager.js';
import type { EngineEvaluation } from '../types/analysis.js';

/**
 * Compute the FEN reached from the starting position after a SAN move sequence
 */
function fenAfter(moves: readonly string[]): string {
  const position = new ChessPosition(STARTING_FEN);
  for (const san of moves) {
    position.move(san);
  }
  return position.fen();
}

const FEN_AFTER_E4 = fenAfter(['e4']);

/**
 * Build a candidate move from the starting position
 */
function candidateFromStart(san: string, priority?: number): CandidateMove {
  const position = new ChessPosition(STARTING_FEN);
  const move = position.moveWithUci(san);
  const candidate: CandidateMove = { san, uci: move.uci, resultingFen: move.fenAfter };
  if (priority !== undefined) {
    candidate.priority = priority;
  }
  return candidate;
}

interface MockEngineOptions {
  /** Return a specific evaluation for a position (falls back to a quiet eval) */
  evalFor?: (fen: string, callIndex: number) => EngineEvaluation | undefined;
  /** Reject every evaluation with this error */
  rejectAll?: Error;
  /** FENs whose evaluation should reject */
  rejectFens?: ReadonlySet<string>;
  /** Artificial latency per evaluation in milliseconds */
  delayMs?: number;
}

interface MockEngine extends EngineService {
  /** FENs passed to evaluateMultiPv, in call order */
  readonly evaluatedFens: string[];
}

/**
 * Create a deterministic in-memory EngineService mock
 */
function createMockEngine(options: MockEngineOptions = {}): MockEngine {
  const evaluatedFens: string[] = [];

  const evaluateMultiPv = async (
    fen: string,
    _depthOrOptions: number | EvaluationOptions,
    _numLines?: number,
  ): Promise<EngineEvaluation[]> => {
    const callIndex = evaluatedFens.length;
    evaluatedFens.push(fen);

    if (options.delayMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
    if (options.rejectAll) {
      throw options.rejectAll;
    }
    if (options.rejectFens?.has(fen)) {
      throw new Error(`mock engine failure for ${fen}`);
    }

    // Vary cp by call index so the eval-stability stopping condition never fires
    const evaluation = options.evalFor?.(fen, callIndex) ?? {
      cp: callIndex * 50,
      depth: 12,
      pv: [],
    };
    return [evaluation];
  };

  return {
    evaluatedFens,
    evaluate: async (fen: string, _depth: number): Promise<EngineEvaluation> => {
      const results = await evaluateMultiPv(fen, 0, 1);
      return results[0]!;
    },
    evaluateMultiPv,
  };
}

describe('PriorityQueueExplorer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic exploration', () => {
    it('explores all queued candidates and stops with queue_empty', async () => {
      const engine = createMockEngine();
      const explorer = createPriorityQueueExplorer(engine, { cache: createArtifactCache() });

      const result = await explorer.explore(STARTING_FEN, [
        candidateFromStart('e4'),
        candidateFromStart('d4'),
      ]);

      expect(result.stoppingReason).toBe('queue_empty');
      expect(result.nodesExplored).toBe(2);
      expect(result.nodesSkipped).toBe(0);
      expect(result.maxDepthReached).toBe(1);
      // Root plus the two candidate nodes
      expect(result.exploredNodes).toHaveLength(3);
      expect(explorer.getQueueSize()).toBe(0);
    });

    it('records the root node retrievable by its position key', async () => {
      const engine = createMockEngine();
      const explorer = createPriorityQueueExplorer(engine, { cache: createArtifactCache() });

      const result = await explorer.explore(STARTING_FEN, [candidateFromStart('e4')]);

      const rootKey = generatePositionKey(STARTING_FEN).key;
      const rootNode = result.exploredNodes.find((node) => node.positionKey === rootKey);
      expect(rootNode).toBeDefined();
      expect(rootNode?.explorationDepth).toBe(0);
      expect(rootNode?.ply).toBe(0);
      expect(rootNode?.isExplored).toBe(true);
    });

    it('skips duplicate positions and counts them as skipped', async () => {
      const engine = createMockEngine();
      const explorer = createPriorityQueueExplorer(engine, { cache: createArtifactCache() });

      const result = await explorer.explore(STARTING_FEN, [
        candidateFromStart('e4', 90),
        candidateFromStart('e4', 10),
      ]);

      expect(result.nodesExplored).toBe(1);
      expect(result.nodesSkipped).toBe(1);
      expect(engine.evaluatedFens).toEqual([FEN_AFTER_E4]);
    });

    it('stores computed evaluations in the real artifact cache', async () => {
      const cache = createArtifactCache();
      const engine = createMockEngine({
        evalFor: (): EngineEvaluation => ({ cp: 42, depth: 12, pv: [] }),
      });
      const explorer = createPriorityQueueExplorer(engine, { cache });
      const candidate = candidateFromStart('e4');

      await explorer.explore(STARTING_FEN, [candidate]);

      const artifact = cache.getEngineEvalForTier(
        generatePositionKey(candidate.resultingFen).key,
        'shallow',
      );
      expect(artifact?.cp).toBe(42);
      expect(artifact?.depth).toBe(12);
    });
  });

  describe('engine failure isolation', () => {
    it('counts nodes as explored even when the engine evaluation rejects', async () => {
      const engine = createMockEngine({ rejectAll: new Error('engine down') });
      const explorer = createPriorityQueueExplorer(engine, { cache: createArtifactCache() });

      const result = await explorer.explore(STARTING_FEN, [
        candidateFromStart('e4'),
        candidateFromStart('d4'),
        candidateFromStart('c4'),
      ]);

      expect(result.nodesExplored).toBe(3);
      expect(result.stoppingReason).toBe('queue_empty');
      for (const node of result.exploredNodes) {
        expect(node.isExplored).toBe(true);
      }
    });

    it('surfaces engine failures through the onWarning callback', async () => {
      const warnings: string[] = [];
      const engine = createMockEngine({ rejectAll: new Error('engine down') });
      const explorer = createPriorityQueueExplorer(engine, {
        cache: createArtifactCache(),
        onWarning: (warning: string): void => {
          warnings.push(warning);
        },
      });

      await explorer.explore(STARTING_FEN, [candidateFromStart('e4'), candidateFromStart('d4')]);

      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toContain('Engine evaluation failed for position');
      expect(warnings[0]).toContain('engine down');
    });

    it('continues exploring remaining candidates after a single failure', async () => {
      const failing = candidateFromStart('e4', 90);
      const healthy = candidateFromStart('d4', 10);
      const warnings: string[] = [];
      const engine = createMockEngine({ rejectFens: new Set([failing.resultingFen]) });
      const explorer = createPriorityQueueExplorer(engine, {
        cache: createArtifactCache(),
        onWarning: (warning: string): void => {
          warnings.push(warning);
        },
      });

      const result = await explorer.explore(STARTING_FEN, [failing, healthy]);

      expect(result.nodesExplored).toBe(2);
      expect(warnings).toHaveLength(1);
      expect(engine.evaluatedFens).toEqual([failing.resultingFen, healthy.resultingFen]);
    });

    it('does not stop the exploration loop when onNodeExplored throws', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const engine = createMockEngine();
      const explorer = createPriorityQueueExplorer(engine, { cache: createArtifactCache() });
      explorer.onNodeExplored((): void => {
        throw new Error('callback boom');
      });

      const result = await explorer.explore(STARTING_FEN, [
        candidateFromStart('e4'),
        candidateFromStart('d4'),
        candidateFromStart('c4'),
      ]);

      expect(result.nodesExplored).toBe(3);
      expect(result.stoppingReason).toBe('queue_empty');
      expect(errorSpy).toHaveBeenCalledTimes(3);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('callback boom'));
    });
  });

  describe('PV handling', () => {
    it('adds DAG edges with SAN and derived UCI from a SAN PV', async () => {
      const dag = createVariationDAG(STARTING_FEN);
      dag.addMove('e4', 'e2e4', FEN_AFTER_E4, 'mainline');
      const engine = createMockEngine({
        evalFor: (fen): EngineEvaluation | undefined =>
          fen === FEN_AFTER_E4 ? { cp: 30, depth: 12, pv: ['e5', 'Nf3'] } : undefined,
      });
      const explorer = createPriorityQueueExplorer(engine, { cache: createArtifactCache(), dag });

      const result = await explorer.explore(STARTING_FEN, [candidateFromStart('e4')]);

      // e4 candidate plus the two PV children
      expect(result.nodesExplored).toBe(3);
      const principal = dag.getPrincipalPath();
      expect(principal.edges.map((edgeId) => dag.getEdge(edgeId)?.san)).toEqual([
        'e4',
        'e5',
        'Nf3',
      ]);
      // Without a pvUci array the UCI is derived from the SAN move
      expect(dag.getEdge(principal.edges[1]!)?.uci).toBe('e7e5');
      expect(dag.getEdge(principal.edges[2]!)?.uci).toBe('g1f3');
    });

    it('uses the parallel pvUci array for edge UCI when provided', async () => {
      const dag = createVariationDAG(STARTING_FEN);
      dag.addMove('e4', 'e2e4', FEN_AFTER_E4, 'mainline');
      const engine = createMockEngine({
        // The second pvUci entry is a sentinel proving the array is passed through
        // as-is (documents current behavior: pvUci is trusted without validation,
        // so the parallel arrays must stay in sync upstream)
        evalFor: (fen): EngineEvaluation | undefined =>
          fen === FEN_AFTER_E4
            ? { cp: 30, depth: 12, pv: ['e5', 'Nf3'], pvUci: ['e7e5', 'sentinel'] }
            : undefined,
      });
      const explorer = createPriorityQueueExplorer(engine, { cache: createArtifactCache(), dag });

      await explorer.explore(STARTING_FEN, [candidateFromStart('e4')]);

      const principal = dag.getPrincipalPath();
      expect(principal.edges.map((edgeId) => dag.getEdge(edgeId)?.san)).toEqual([
        'e4',
        'e5',
        'Nf3',
      ]);
      expect(dag.getEdge(principal.edges[1]!)?.uci).toBe('e7e5');
      expect(dag.getEdge(principal.edges[2]!)?.uci).toBe('sentinel');
    });

    it('rejects UCI-format pv entries without creating edges', async () => {
      // documents current behavior: pv entries in UCI format are rejected by the
      // isUciMove guard (upstream must provide SAN), so no children are created
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const dag = createVariationDAG(STARTING_FEN);
      dag.addMove('e4', 'e2e4', FEN_AFTER_E4, 'mainline');
      const engine = createMockEngine({
        evalFor: (fen): EngineEvaluation | undefined =>
          fen === FEN_AFTER_E4 ? { cp: 30, depth: 12, pv: ['e7e5', 'g1f3'] } : undefined,
      });
      const explorer = createPriorityQueueExplorer(engine, { cache: createArtifactCache(), dag });

      const result = await explorer.explore(STARTING_FEN, [candidateFromStart('e4')]);

      expect(result.nodesExplored).toBe(1);
      // Only the pre-seeded e4 edge remains
      expect(dag.getStats().edgeCount).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('is UCI format'));
    });

    it('keeps the valid PV prefix and skips the rest on a garbage entry', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const dag = createVariationDAG(STARTING_FEN);
      dag.addMove('e4', 'e2e4', FEN_AFTER_E4, 'mainline');
      const engine = createMockEngine({
        evalFor: (fen): EngineEvaluation | undefined =>
          fen === FEN_AFTER_E4 ? { cp: 30, depth: 12, pv: ['e5', 'zz9', 'Nf3'] } : undefined,
      });
      const explorer = createPriorityQueueExplorer(engine, { cache: createArtifactCache(), dag });

      const result = await explorer.explore(STARTING_FEN, [candidateFromStart('e4')]);

      expect(result.stoppingReason).toBe('queue_empty');
      // e4 plus the valid e5 prefix; "zz9" aborts the remainder of the PV
      expect(dag.getStats().edgeCount).toBe(2);
      expect(result.nodesExplored).toBe(2);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process PV move "zz9"'),
      );
    });
  });

  describe('stopping conditions', () => {
    it('stops exactly at maxNodes', async () => {
      const candidates = ['e4', 'd4', 'c4', 'Nf3', 'g3', 'b3'].map((san) =>
        candidateFromStart(san),
      );
      const engine = createMockEngine();
      const explorer = createPriorityQueueExplorer(engine, {
        cache: createArtifactCache(),
        maxNodes: 3,
      });

      const result = await explorer.explore(STARTING_FEN, candidates);

      expect(result.stoppingReason).toBe('max_nodes_reached');
      expect(result.nodesExplored).toBe(3);
      expect(engine.evaluatedFens).toHaveLength(3);
    });

    it('respects the time budget', async () => {
      const candidates = ['e4', 'd4', 'c4', 'Nf3', 'g3', 'b3', 'h3', 'a3'].map((san) =>
        candidateFromStart(san),
      );
      const engine = createMockEngine({ delayMs: 25 });
      const explorer = createPriorityQueueExplorer(engine, {
        cache: createArtifactCache(),
        budgetMs: 40,
      });

      const start = Date.now();
      const result = await explorer.explore(STARTING_FEN, candidates);
      const elapsed = Date.now() - start;

      expect(result.stoppingReason).toBe('budget_exhausted');
      expect(result.nodesExplored).toBeGreaterThanOrEqual(1);
      expect(result.nodesExplored).toBeLessThan(candidates.length);
      // Generous real-time bound: the loop must not run anywhere near all 8 evals
      expect(elapsed).toBeLessThan(5000);
    });
  });

  describe('priority ordering', () => {
    it('expands higher-priority candidates first', async () => {
      const order: string[] = [];
      const engine = createMockEngine();
      const explorer = createPriorityQueueExplorer(engine, { cache: createArtifactCache() });
      explorer.onNodeExplored((node): void => {
        order.push(node.parentMove ?? '');
      });

      await explorer.explore(STARTING_FEN, [
        candidateFromStart('d4', 10),
        candidateFromStart('e4', 90),
        candidateFromStart('c4', 50),
      ]);

      expect(order).toEqual(['e4', 'c4', 'd4']);
    });
  });

  describe('variation extraction', () => {
    it('extracts multi-move variations through the parent chain', async () => {
      const dag = createVariationDAG(STARTING_FEN);
      dag.addMove('e4', 'e2e4', FEN_AFTER_E4, 'mainline');
      const engine = createMockEngine({
        evalFor: (fen): EngineEvaluation | undefined =>
          fen === FEN_AFTER_E4 ? { cp: 30, depth: 12, pv: ['e5', 'Nf3'] } : undefined,
      });
      const explorer = createPriorityQueueExplorer(engine, { cache: createArtifactCache(), dag });

      const result = await explorer.explore(STARTING_FEN, [candidateFromStart('e4')]);

      // PV children chain to their true parents, so the full line reconstructs
      // without skipping intermediate moves
      expect(result.variations).toContainEqual(['e4', 'e5', 'Nf3']);
      expect(result.variations).toHaveLength(1);
    });

    it('notifies onVariationComplete for each extracted variation', async () => {
      const completed: string[][] = [];
      const dag = createVariationDAG(STARTING_FEN);
      dag.addMove('e4', 'e2e4', FEN_AFTER_E4, 'mainline');
      const engine = createMockEngine({
        evalFor: (fen): EngineEvaluation | undefined =>
          fen === FEN_AFTER_E4 ? { cp: 30, depth: 12, pv: ['e5'] } : undefined,
      });
      const explorer = createPriorityQueueExplorer(engine, { cache: createArtifactCache(), dag });
      explorer.onVariationComplete((moves): void => {
        completed.push(moves);
      });

      const result = await explorer.explore(STARTING_FEN, [candidateFromStart('e4')]);

      expect(completed).toContainEqual(['e4', 'e5']);
      expect(completed).toEqual(result.variations);
    });
  });
});
