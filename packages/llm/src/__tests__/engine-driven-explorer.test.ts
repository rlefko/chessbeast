/**
 * Tests for the Engine-Driven Explorer
 *
 * Covers the public API (createEngineDrivenExplorer / EngineDrivenExplorer.explore)
 * using a purpose-built mock EngineService with per-FEN PV control and a real
 * ArtifactCache / VariationDAG from @chessbeast/core.
 *
 * Historical defect classes pinned here:
 * - PR #92: the played move must always be explorable, even with a broken engine
 * - PR #91: engine PVs arrive as SAN (adapter output); candidates must not be skipped
 *           and DAG edges must never store UCI strings in their `san` field
 * - PR #99: DAG edges must carry REAL UCI (castling/promotion included)
 * - PR #95: intents must attach to the game ply, not the exploration depth
 * - PR #93/#96: critical played moves always yield a fallback intent with context
 * - PR #94: engine/callback failures must not abort exploration
 * - PR #90: intent generation works with theme detection disabled
 */

import {
  createArtifactCache,
  createVariationDAG,
  type VariationDAG,
  type VariationEdge,
} from '@chessbeast/core';
import { ChessPosition } from '@chessbeast/pgn';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import {
  EngineDrivenExplorer,
  createEngineDrivenExplorer,
  type EngineDrivenExplorerConfig,
  type EngineDrivenExplorerProgress,
} from '../explorer/engine-driven-explorer.js';
import type { EngineEvaluation, EngineService } from '../explorer/types.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** UCI move pattern: source square + target square + optional promotion piece */
const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbnQRBN]?$/;

/**
 * Options accepted by EngineService.evaluateMultiPv
 */
interface MultiPvOptions {
  depth?: number;
  timeLimitMs?: number;
  numLines?: number;
}

/**
 * A recorded evaluateMultiPv call for assertions
 */
interface RecordedEvalCall {
  fen: string;
  options: MultiPvOptions;
}

/**
 * Local mock EngineService with configurable per-FEN evaluations.
 *
 * - `setEvals(fen, evals)` returns the given evaluations for that exact FEN
 * - `setError(fen, error)` rejects evaluations for that exact FEN
 * - `rejectAll(error)` rejects every evaluation
 * - unknown FENs resolve to an empty evaluation list (engine found nothing)
 */
class MockEngineService implements EngineService {
  readonly calls: RecordedEvalCall[] = [];

  private readonly evalsByFen = new Map<string, EngineEvaluation[]>();
  private readonly errorsByFen = new Map<string, Error>();
  private rejectAllError: Error | undefined;

  setEvals(fen: string, evals: EngineEvaluation[]): void {
    this.evalsByFen.set(fen, evals);
  }

  setError(fen: string, error: Error): void {
    this.errorsByFen.set(fen, error);
  }

  rejectAll(error: Error): void {
    this.rejectAllError = error;
  }

  async evaluate(fen: string, depth: number): Promise<EngineEvaluation> {
    const evals = await this.evaluateMultiPv(fen, { depth });
    return evals[0] ?? { depth, pv: [] };
  }

  async evaluateMultiPv(fen: string, options: MultiPvOptions): Promise<EngineEvaluation[]> {
    this.calls.push({ fen, options });
    if (this.rejectAllError) {
      throw this.rejectAllError;
    }
    const error = this.errorsByFen.get(fen);
    if (error) {
      throw error;
    }
    return this.evalsByFen.get(fen) ?? [];
  }
}

/**
 * Compute the FEN reached after applying SAN moves from a starting position
 */
function fenAfter(moves: string[], startFen: string = START_FEN): string {
  const position = new ChessPosition(startFen);
  for (const san of moves) {
    position.move(san);
  }
  return position.fen();
}

/**
 * Build a shared DAG with a mainline, mirroring ultra-fast-coach-runner.ts
 */
function buildSharedDag(startFen: string, mainline: string[]): VariationDAG {
  const dag = createVariationDAG(startFen);
  const position = new ChessPosition(startFen);
  for (const san of mainline) {
    const uci = position.sanToUci(san);
    position.move(san);
    dag.addMove(san, uci, position.fen(), 'mainline', { makePrincipal: true });
  }
  return dag;
}

/**
 * Collect every edge reachable from the DAG root (public traversal only)
 */
function collectEdges(dag: VariationDAG): VariationEdge[] {
  const edges: VariationEdge[] = [];
  const visitedNodes = new Set<string>();
  const visitedEdges = new Set<string>();
  const queue = [dag.getRoot()];

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visitedNodes.has(node.nodeId)) continue;
    visitedNodes.add(node.nodeId);

    for (const edgeId of node.childEdges) {
      const edge = dag.getEdge(edgeId);
      if (!edge || visitedEdges.has(edge.edgeId)) continue;
      visitedEdges.add(edge.edgeId);
      edges.push(edge);

      const child = dag.getNode(edge.toNode);
      if (child) queue.push(child);
    }
  }

  return edges;
}

/**
 * Create an explorer wired to a fresh real ArtifactCache
 */
function makeExplorer(
  engine: EngineService,
  config?: Partial<EngineDrivenExplorerConfig>,
): EngineDrivenExplorer {
  return createEngineDrivenExplorer(engine, createArtifactCache(), config);
}

describe('EngineDrivenExplorer', () => {
  let warnSpy: MockInstance;
  let errorSpy: MockInstance;

  beforeEach(() => {
    // The explorer and PriorityQueueExplorer log via console; keep output clean
    // and make the warnings observable for assertions.
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('factory and result shape', () => {
    it('createEngineDrivenExplorer returns an EngineDrivenExplorer whose explore() resolves a complete result', async () => {
      const engine = new MockEngineService();
      const explorer = makeExplorer(engine, { detectThemes: false });

      expect(explorer).toBeInstanceOf(EngineDrivenExplorer);

      const result = await explorer.explore(START_FEN, 'e4', 'mistake');

      expect(result.stoppingReason).toBe('queue_empty');
      expect(result.dag.getRoot().fen).toBe(START_FEN);
      expect(result.themes).toBeInstanceOf(Map);
      expect(result.themeSummaries).toBeInstanceOf(Map);
      expect(result.timeMs).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.variations)).toBe(true);
      expect(Array.isArray(result.intents)).toBe(true);
    });

    it('explore() requests a 5-line depth-18 multipv evaluation of the root position to build candidates', async () => {
      const engine = new MockEngineService();
      const explorer = makeExplorer(engine, { detectThemes: false });

      await explorer.explore(START_FEN, 'e4', 'mistake');

      expect(engine.calls[0]).toEqual({
        fen: START_FEN,
        options: { depth: 18, numLines: 5 },
      });
    });

    it('result.dag is the exact sharedDag instance when one is provided via config', async () => {
      const engine = new MockEngineService();
      const sharedDag = buildSharedDag(START_FEN, ['e4']);
      const explorer = makeExplorer(engine, { detectThemes: false, sharedDag });

      const result = await explorer.explore(START_FEN, 'e4', 'mistake');

      expect(result.dag).toBe(sharedDag);
    });

    it('a sharedDag that does not contain the exploration root falls back to the DAG root without throwing or adding edges', async () => {
      const engine = new MockEngineService();
      const sharedDag = buildSharedDag(START_FEN, []); // root only, no mainline
      const explorer = makeExplorer(engine, { detectThemes: false, sharedDag });

      const rootFen = fenAfter(['e4', 'e5']); // not present in the DAG
      const result = await explorer.explore(rootFen, 'Nf3', 'good');

      expect(result.nodesExplored).toBe(1);
      expect(sharedDag.getStats().edgeCount).toBe(0);
    });
  });

  // pins PR #92: the played move must always be explorable
  describe('played move always explorable (PR #92)', () => {
    it('explores the played move (nodesExplored > 0) when the engine returns no evaluations at all', async () => {
      const engine = new MockEngineService(); // resolves [] for every FEN
      const explorer = makeExplorer(engine, { detectThemes: false });

      const result = await explorer.explore(START_FEN, 'e4', 'mistake');

      expect(result.nodesExplored).toBe(1);
      expect(result.nodesExplored).toBeGreaterThan(0);
      expect(result.variations.map((line) => line.moves)).toContainEqual(['e4']);
      expect(result.intents.length).toBeGreaterThanOrEqual(1);
    });

    it('explores the played move and warns when the engine returns garbage PV moves', async () => {
      const engine = new MockEngineService();
      engine.setEvals(START_FEN, [{ cp: 15, depth: 18, pv: ['zzz9'] }]);
      const explorer = makeExplorer(engine, { detectThemes: false });

      const result = await explorer.explore(START_FEN, 'e4', 'mistake');

      expect(result.nodesExplored).toBe(1);
      expect(result.stoppingReason).toBe('queue_empty');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not get FEN for engine move zzz9'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Only 1 candidate(s) from 1 evaluations'),
      );
    });

    // documents current behavior; arguably a bug: the first PV move of the top
    // engine line is captured as "best move" before any legality validation, so
    // a garbage move string flows straight into the intent's bestAlternative.
    it('an unvalidated garbage engine best move flows into the played-move intent bestAlternative (documents current behavior)', async () => {
      const engine = new MockEngineService();
      engine.setEvals(START_FEN, [{ cp: 15, depth: 18, pv: ['zzz9'] }]);
      const explorer = makeExplorer(engine, { detectThemes: false });

      const result = await explorer.explore(START_FEN, 'e4', 'blunder');

      expect(result.intents[0]!.content.bestAlternative).toBe('zzz9');
    });

    // documents current behavior: the root node is put into the explored set
    // without being counted as explored, so it is reported as one "cache hit"
    // (nodesSkipped) even when the cache never returned anything.
    it('result counters reflect a single explored node plus the root reported as a cache hit (documents current behavior)', async () => {
      const engine = new MockEngineService();
      const explorer = makeExplorer(engine, { detectThemes: false });

      const result = await explorer.explore(START_FEN, 'e4', 'mistake');

      expect(result.nodesExplored).toBe(1);
      expect(result.cacheHits).toBe(1);
      expect(result.maxDepthReached).toBe(1);
    });
  });

  // pins PR #91: engine adapters produce SAN PVs; nothing may be skipped and
  // the DAG must never end up with UCI strings in edge.san
  describe('PV-is-SAN handling (PR #91)', () => {
    interface SanPvScenario {
      engine: MockEngineService;
      sharedDag: VariationDAG;
      explorer: EngineDrivenExplorer;
    }

    function buildSanPvScenario(): SanPvScenario {
      const engine = new MockEngineService();
      // Root multipv: three distinct SAN first moves (as the CLI adapter produces)
      engine.setEvals(START_FEN, [
        { cp: 30, depth: 18, pv: ['e4', 'e5', 'Nf3'] },
        { cp: 20, depth: 18, pv: ['d4', 'd5'] },
        { cp: 15, depth: 18, pv: ['Nf3', 'd5'] },
      ]);
      // The played-move node is on the shared DAG mainline, so its PV expands into edges
      engine.setEvals(fenAfter(['e4']), [{ cp: 30, depth: 12, pv: ['e5', 'Nf3', 'Nc6'] }]);

      const sharedDag = buildSharedDag(START_FEN, ['e4']);
      const explorer = makeExplorer(engine, { detectThemes: false, sharedDag });
      return { engine, sharedDag, explorer };
    }

    it('keeps and explores every SAN multipv candidate, skipping none', async () => {
      const { explorer } = buildSanPvScenario();

      const result = await explorer.explore(START_FEN, 'e4', 'inaccuracy');

      // 3 candidates (e4 played, d4, Nf3) + 3 PV children under the e4 node
      expect(result.nodesExplored).toBe(6);
      const variationMoves = result.variations.map((line) => line.moves);
      expect(variationMoves).toHaveLength(5);
      expect(variationMoves).toContainEqual(['d4']);
      expect(variationMoves).toContainEqual(['Nf3']);
      expect(variationMoves).toContainEqual(['e5']);
      expect(variationMoves).toContainEqual(['Nc6']);
      // documents current behavior; arguably a bug: PriorityQueueExplorer keys
      // its exploredNodes map by positionKey but extractVariations looks parents
      // up by parentNodeId, so the parent-chain walk always misses and every
      // legacy variation is truncated to a single move (['e4', 'e5'] never appears).
      expect(variationMoves).not.toContainEqual(['e4', 'e5']);
    });

    it('never stores a UCI-shaped string in edge.san and always stores real UCI in edge.uci', async () => {
      const { explorer, sharedDag } = buildSanPvScenario();

      await explorer.explore(START_FEN, 'e4', 'inaccuracy');

      const edges = collectEdges(sharedDag);
      // mainline e4 + explorer-added e5, Nf3, Nc6
      expect(edges).toHaveLength(4);
      for (const edge of edges) {
        expect(edge.san).not.toMatch(UCI_PATTERN);
        expect(edge.uci).toMatch(UCI_PATTERN);
      }

      const uciBySan = new Map(edges.map((edge) => [edge.san, edge.uci]));
      expect(uciBySan.get('e5')).toBe('e7e5');
      expect(uciBySan.get('Nf3')).toBe('g1f3');
      expect(uciBySan.get('Nc6')).toBe('b8c6');
    });
  });

  // pins PR #99: explorer-added DAG edges carry real derived UCI
  describe('real UCI on DAG edges (PR #99)', () => {
    it("stores uci 'e2e4' for an explorer-added 'e4' PV move (and real UCI for pawn pushes and captures)", async () => {
      const engine = new MockEngineService();
      // 1.a3 d5 2.e4 dxe4 as the engine PV from the played-move node
      engine.setEvals(fenAfter(['a3']), [{ cp: -20, depth: 12, pv: ['d5', 'e4', 'dxe4'] }]);

      const sharedDag = buildSharedDag(START_FEN, ['a3']);
      const explorer = makeExplorer(engine, { detectThemes: false, sharedDag });

      await explorer.explore(START_FEN, 'a3');

      const uciBySan = new Map(collectEdges(sharedDag).map((edge) => [edge.san, edge.uci]));
      expect(uciBySan.get('e4')).toBe('e2e4');
      expect(uciBySan.get('d5')).toBe('d7d5');
      expect(uciBySan.get('dxe4')).toBe('d5e4');
    });

    it("stores king-move UCI ('e1g1' / 'e8g8') for castling SAN 'O-O'", async () => {
      const engine = new MockEngineService();
      const mainline = ['e4', 'e5', 'Nf3', 'Nf6', 'Bc4', 'Bc5'];
      const rootFen = fenAfter(['e4', 'e5', 'Nf3', 'Nf6', 'Bc4']);
      // After ...Bc5 both sides castle kingside in the engine PV
      engine.setEvals(fenAfter(mainline), [{ cp: 20, depth: 12, pv: ['O-O', 'O-O'] }]);

      const sharedDag = buildSharedDag(START_FEN, mainline);
      const explorer = makeExplorer(engine, { detectThemes: false, sharedDag });

      await explorer.explore(rootFen, 'Bc5');

      const castlingUcis = collectEdges(sharedDag)
        .filter((edge) => edge.san === 'O-O')
        .map((edge) => edge.uci)
        .sort();
      expect(castlingUcis).toEqual(['e1g1', 'e8g8']);
    });

    it("stores promotion UCI with a lowercase piece suffix ('a2a1q') for SAN 'a1=Q'", async () => {
      const promoFen = '8/8/8/8/6k1/8/p7/6K1 w - - 0 1';
      const engine = new MockEngineService();
      engine.setEvals(fenAfter(['Kh1'], promoFen), [{ cp: -900, depth: 12, pv: ['a1=Q'] }]);

      const sharedDag = buildSharedDag(promoFen, ['Kh1']);
      const explorer = makeExplorer(engine, { detectThemes: false, sharedDag });

      await explorer.explore(promoFen, 'Kh1');

      const promotionEdge = collectEdges(sharedDag).find((edge) => edge.san === 'a1=Q');
      expect(promotionEdge).toBeDefined();
      expect(promotionEdge!.uci).toBe('a2a1q');
      expect(promotionEdge!.uci.endsWith('q')).toBe(true);
    });
  });

  // pins PR #95: comments landed on the wrong ply because exploration depth
  // was used instead of the game ply
  describe('gamePly propagation (PR #95)', () => {
    const FEN_MOVE_13_WHITE = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 13';
    const FEN_MOVE_6_WHITE = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 6';

    it('node intents attach to the provided gamePly, not the exploration depth', async () => {
      const engine = new MockEngineService();
      const explorer = makeExplorer(engine, { detectThemes: false });

      const result = await explorer.explore(FEN_MOVE_13_WHITE, 'e4', undefined, undefined, 24);

      expect(result.intents).toHaveLength(1);
      expect(result.intents[0]!.plyIndex).toBe(24);
      expect(result.intents[0]!.content.moveNumber).toBe(13);
      expect(result.intents[0]!.content.isWhiteMove).toBe(true);
    });

    it('the played-move intent attaches to the ply after the move (gamePly + 1) while node intents stay on gamePly', async () => {
      const engine = new MockEngineService();
      const explorer = makeExplorer(engine, { detectThemes: false });

      const result = await explorer.explore(FEN_MOVE_13_WHITE, 'e4', 'blunder', undefined, 24);

      const plies = result.intents.map((intent) => intent.plyIndex);
      // Primary played-move intent is first and lives on the position AFTER the move
      expect(result.intents[0]!.type).toBe('blunder_explanation');
      expect(result.intents[0]!.plyIndex).toBe(25);
      // Every intent derives from the game ply 24, never the exploration depth (1)
      for (const ply of plies) {
        expect([24, 25]).toContain(ply);
      }
      expect(plies).not.toContain(1);
    });

    it('two explorations at different gamePly values do not collide on the same ply indices', async () => {
      const engine = new MockEngineService();
      const explorer = makeExplorer(engine, { detectThemes: false });

      const resultA = await explorer.explore(FEN_MOVE_6_WHITE, 'e4', 'blunder', undefined, 10);
      const resultB = await explorer.explore(FEN_MOVE_13_WHITE, 'e4', 'blunder', undefined, 24);

      const pliesA = new Set(resultA.intents.map((intent) => intent.plyIndex));
      const pliesB = new Set(resultB.intents.map((intent) => intent.plyIndex));

      expect(pliesA.size).toBeGreaterThan(0);
      expect(pliesB.size).toBeGreaterThan(0);
      for (const ply of pliesA) {
        expect(pliesB.has(ply)).toBe(false);
      }
    });

    it('when gamePly is omitted the ply is derived from the FEN move number and side to move', async () => {
      const engine = new MockEngineService();
      const explorer = makeExplorer(engine, { detectThemes: false });

      // Move 13, white to move -> 0-based ply (13 - 1) * 2 = 24
      const whiteResult = await explorer.explore(FEN_MOVE_13_WHITE, 'e4');
      expect(whiteResult.intents[0]!.plyIndex).toBe(24);

      // Move 13, black to move -> 0-based ply (13 - 1) * 2 + 1 = 25
      const blackFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 13';
      const blackResult = await explorer.explore(blackFen, 'e5');
      expect(blackResult.intents[0]!.plyIndex).toBe(25);
    });
  });

  // pins PR #93 (+ context from PR #96/#99): critical played moves always get
  // a fallback intent even without theme deltas
  describe('fallback intent for critical moves (PR #93)', () => {
    it('a blunder with theme detection disabled and zero engine data still yields a mandatory blunder_explanation intent carrying fen and classification', async () => {
      const engine = new MockEngineService();
      const explorer = makeExplorer(engine, { detectThemes: false });

      const result = await explorer.explore(START_FEN, 'e4', 'blunder');

      expect(result.intents.length).toBeGreaterThanOrEqual(1);
      const intent = result.intents[0]!;
      expect(intent.type).toBe('blunder_explanation');
      expect(intent.mandatory).toBe(true);
      expect(intent.priority).toBe(1.0);
      expect(intent.suggestedLength).toBe('detailed');
      expect(intent.content.fen).toBe(START_FEN);
      expect(intent.content.move).toBe('e4');
      expect(intent.content.ideaKeys[0]!.key).toBe('played_blunder_e4');
      expect(intent.content.ideaKeys[0]!.concept).toBe('blunder');
      expect(intent.content.themeExplanation).toContain('blunder');
    });

    it('a blunder with theme detection enabled but zero theme deltas still yields the played-move intent first', async () => {
      const engine = new MockEngineService();
      const explorer = makeExplorer(engine); // detectThemes defaults to true

      const result = await explorer.explore(START_FEN, 'e4', 'blunder');

      expect(result.intents.length).toBeGreaterThanOrEqual(1);
      expect(result.intents[0]!.type).toBe('blunder_explanation');
      expect(result.intents[0]!.content.move).toBe('e4');
    });

    it('a mistake yields a mandatory what_was_missed intent with mistake context', async () => {
      const engine = new MockEngineService();
      const explorer = makeExplorer(engine, { detectThemes: false });

      const result = await explorer.explore(START_FEN, 'e4', 'mistake');

      const intent = result.intents[0]!;
      expect(intent.type).toBe('what_was_missed');
      expect(intent.mandatory).toBe(true);
      expect(intent.priority).toBe(0.95);
      expect(intent.content.ideaKeys[0]!.concept).toBe('mistake');
      expect(intent.content.themeExplanation).toMatch(/mistake/);
    });

    it('the played-move intent carries bestAlternative and evalBefore from the engine root evaluation', async () => {
      const engine = new MockEngineService();
      engine.setEvals(START_FEN, [{ cp: 250, depth: 18, pv: ['Nf3', 'd5'] }]);
      const explorer = makeExplorer(engine, { detectThemes: false });

      const result = await explorer.explore(START_FEN, 'e4', 'blunder');

      const intent = result.intents[0]!;
      expect(intent.type).toBe('blunder_explanation');
      expect(intent.content.bestAlternative).toBe('Nf3');
      expect(intent.content.evalBefore).toBe(250);
      expect(intent.content.themeExplanation).toBe('This move is a blunder. Better was Nf3.');
    });
  });

  // pins PR #94: failures in one node or in a consumer callback must not
  // abort the whole exploration
  describe('isolation (PR #94)', () => {
    it('an engine rejection for one node does not abort exploration of siblings or PV children', async () => {
      const engine = new MockEngineService();
      engine.setEvals(START_FEN, [
        { cp: 30, depth: 18, pv: ['e4'] },
        { cp: 10, depth: 18, pv: ['d4', 'd5'] },
      ]);
      engine.setError(fenAfter(['d4']), new Error('engine crashed on this position'));
      engine.setEvals(fenAfter(['e4']), [{ cp: 25, depth: 12, pv: ['e5'] }]);

      const sharedDag = buildSharedDag(START_FEN, ['e4']);
      const explorer = makeExplorer(engine, { detectThemes: false, sharedDag });

      const result = await explorer.explore(START_FEN, 'e4', 'mistake');

      // e4 (played), d4 (rejected but still processed), e5 (PV child of e4)
      expect(result.nodesExplored).toBe(3);
      expect(result.stoppingReason).toBe('queue_empty');
      expect(collectEdges(sharedDag).some((edge) => edge.san === 'e5')).toBe(true);
    });

    it('an engine that rejects every evaluation still explores the played move and yields the fallback intent', async () => {
      const engine = new MockEngineService();
      engine.rejectAll(new Error('engine down'));
      const explorer = makeExplorer(engine, { detectThemes: false });

      const result = await explorer.explore(START_FEN, 'e4', 'blunder');

      expect(result.nodesExplored).toBe(1);
      const intent = result.intents[0]!;
      expect(intent.type).toBe('blunder_explanation');
      expect(intent.content.bestAlternative).toBeUndefined();
      expect(intent.content.themeExplanation).toContain('allows the opponent to gain advantage');
    });

    it('an onProgress callback that throws mid-exploration does not kill exploration', async () => {
      const engine = new MockEngineService();
      const explorer = makeExplorer(engine, { detectThemes: false });

      const throwingProgress = (progress: EngineDrivenExplorerProgress): void => {
        if (progress.nodesExplored > 0) {
          throw new Error('progress consumer exploded');
        }
      };

      const result = await explorer.explore(START_FEN, 'e4', 'mistake', throwingProgress);

      expect(result.nodesExplored).toBe(1);
      expect(result.intents.length).toBeGreaterThanOrEqual(1);
      // The priority-queue explorer swallows the callback error and logs it
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Callback error'));
    });

    // documents current behavior; arguably a bug: only the per-node progress
    // callbacks are guarded (inside PriorityQueueExplorer); the initial
    // onProgress call made directly by explore() is unguarded, so a callback
    // that throws immediately rejects the whole exploration.
    it('an onProgress callback that throws on the very first call rejects explore() (documents current behavior)', async () => {
      const engine = new MockEngineService();
      const explorer = makeExplorer(engine, { detectThemes: false });

      const alwaysThrows = (): void => {
        throw new Error('progress exploded');
      };

      await expect(explorer.explore(START_FEN, 'e4', 'mistake', alwaysThrows)).rejects.toThrow(
        'progress exploded',
      );
    });
  });

  // pins PR #90: intent generation must not depend on theme detection
  describe('theme detection disabled (PR #90)', () => {
    it('detectThemes: false with no played move still produces node intents from engine candidates', async () => {
      const engine = new MockEngineService();
      engine.setEvals(START_FEN, [
        { cp: 50, depth: 18, pv: ['e4', 'e5'] },
        { cp: 40, depth: 18, pv: ['d4', 'd5'] },
      ]);
      const explorer = makeExplorer(engine, { detectThemes: false });

      const result = await explorer.explore(START_FEN, undefined, undefined, undefined, 24);

      expect(result.intents).toHaveLength(2);
      for (const intent of result.intents) {
        expect(intent.plyIndex).toBe(24);
      }
      expect(result.themes.size).toBe(0);
      expect(result.themeSummaries.size).toBe(0);
    });
  });
});
