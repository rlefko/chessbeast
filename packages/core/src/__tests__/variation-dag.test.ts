import { ChessPosition } from '@chessbeast/pgn';
import { describe, it, expect, afterEach, vi } from 'vitest';

import { generatePositionKey } from '../storage/position-key.js';
import { createVariationDAG } from '../storage/variation-dag/dag-manager.js';

/**
 * Compute the FEN reached from the starting position after a SAN move sequence
 */
function fenAfter(moves: readonly string[]): string {
  const position = new ChessPosition();
  for (const san of moves) {
    position.move(san);
  }
  return position.fen();
}

const FEN_E4 = fenAfter(['e4']);
const FEN_D4 = fenAfter(['d4']);
const FEN_E4_E5 = fenAfter(['e4', 'e5']);
const FEN_E4_E5_NF3 = fenAfter(['e4', 'e5', 'Nf3']);
const FEN_E4_C5 = fenAfter(['e4', 'c5']);

describe('VariationDAG', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('creates a root node at ply 0 with empty stats', () => {
      const dag = createVariationDAG();
      const root = dag.getRoot();

      expect(root.ply).toBe(0);
      expect(root.parentEdges).toHaveLength(0);
      expect(root.childEdges).toHaveLength(0);
      expect(dag.getCurrentNode()).toBe(root);
      expect(dag.getStats()).toEqual({
        nodeCount: 1,
        edgeCount: 0,
        transpositionCount: 0,
        maxDepth: 0,
      });
    });
  });

  describe('addMove', () => {
    it('creates a new node and edge and navigates to the child', () => {
      const dag = createVariationDAG();
      const result = dag.addMove('e4', 'e2e4', FEN_E4);

      expect(result.isNewNode).toBe(true);
      expect(result.isTransposition).toBe(false);
      expect(result.node.ply).toBe(1);
      expect(result.edge.san).toBe('e4');
      expect(result.edge.uci).toBe('e2e4');
      expect(dag.getCurrentNode()).toBe(result.node);
      expect(dag.getStats()).toMatchObject({ nodeCount: 2, edgeCount: 1 });
    });

    it('stays on the current node when navigateToChild is false', () => {
      const dag = createVariationDAG();
      const root = dag.getRoot();
      const result = dag.addMove('e4', 'e2e4', FEN_E4, 'exploration', { navigateToChild: false });

      expect(result.isNewNode).toBe(true);
      expect(dag.getCurrentNode()).toBe(root);
    });
  });

  describe('principal edges', () => {
    it('makes the first edge principal automatically, later siblings are not', () => {
      const dag = createVariationDAG();
      const first = dag.addAlternative('e4', 'e2e4', FEN_E4);
      const second = dag.addAlternative('d4', 'd2d4', FEN_D4);

      expect(first.edge.isPrincipal).toBe(true);
      expect(second.edge.isPrincipal).toBe(false);
      expect(dag.getRoot().principalChildEdge).toBe(first.edge.edgeId);
    });

    it('makePrincipal promotes a new sibling and demotes the old principal', () => {
      const dag = createVariationDAG();
      const first = dag.addMove('e4', 'e2e4', FEN_E4);
      dag.goToRoot();
      const second = dag.addMove('d4', 'd2d4', FEN_D4, 'exploration', { makePrincipal: true });

      expect(second.edge.isPrincipal).toBe(true);
      expect(first.edge.isPrincipal).toBe(false);
      expect(dag.getRoot().principalChildEdge).toBe(second.edge.edgeId);
    });

    it('does not promote an existing edge when re-added with makePrincipal', () => {
      // documents current behavior; arguably a bug: the edge-dedup fast path returns
      // before the makePrincipal option is applied, so an existing alternative can
      // never be promoted through addMove
      const dag = createVariationDAG();
      const first = dag.addMove('e4', 'e2e4', FEN_E4);
      dag.goToRoot();
      const second = dag.addMove('d4', 'd2d4', FEN_D4);
      dag.goToRoot();

      const readded = dag.addMove('d4', 'd2d4', FEN_D4, 'exploration', { makePrincipal: true });

      expect(readded.edge.edgeId).toBe(second.edge.edgeId);
      expect(readded.edge.isPrincipal).toBe(false);
      expect(dag.getRoot().principalChildEdge).toBe(first.edge.edgeId);
    });

    it('getPrincipalPath follows principal edges from the root', () => {
      const dag = createVariationDAG();
      dag.addMove('e4', 'e2e4', FEN_E4, 'mainline');
      dag.addMove('e5', 'e7e5', FEN_E4_E5, 'mainline');
      dag.addMove('Nf3', 'g1f3', FEN_E4_E5_NF3, 'mainline');
      dag.goToFen(FEN_E4);
      dag.addAlternative('c5', 'c7c5', FEN_E4_C5);

      const path = dag.getPrincipalPath();
      expect(path.length).toBe(3);
      expect(path.edges.map((edgeId) => dag.getEdge(edgeId)?.san)).toEqual(['e4', 'e5', 'Nf3']);
    });
  });

  describe('edge deduplication', () => {
    it('re-adding the same san/uci returns the existing edge and node', () => {
      const dag = createVariationDAG();
      const first = dag.addMove('e4', 'e2e4', FEN_E4);
      dag.goToRoot();
      const again = dag.addMove('e4', 'e2e4', FEN_E4);

      expect(again.isNewNode).toBe(false);
      expect(again.isTransposition).toBe(false);
      expect(again.edge.edgeId).toBe(first.edge.edgeId);
      expect(again.node.nodeId).toBe(first.node.nodeId);
      expect(dag.getStats()).toMatchObject({ nodeCount: 2, edgeCount: 1 });
      // Dedup still navigates to the existing child by default
      expect(dag.getCurrentNode().nodeId).toBe(first.node.nodeId);
    });

    it('dedups by UCI even when the SAN label differs', () => {
      const dag = createVariationDAG();
      const first = dag.addMove('e4', 'e2e4', FEN_E4);
      dag.goToRoot();
      const again = dag.addMove('e4!?', 'e2e4', FEN_E4);

      expect(again.isNewNode).toBe(false);
      expect(again.edge.edgeId).toBe(first.edge.edgeId);
      expect(dag.getStats().edgeCount).toBe(1);
    });

    it('increments the visit count of the existing target node', () => {
      const dag = createVariationDAG();
      const first = dag.addMove('e4', 'e2e4', FEN_E4);
      const visitsBefore = first.node.metadata.visitCount;
      dag.goToRoot();
      dag.addMove('e4', 'e2e4', FEN_E4);

      expect(first.node.metadata.visitCount).toBe(visitsBefore + 1);
    });
  });

  describe('transposition merging', () => {
    it('merges 1.e4 e5 2.Nf3 with 1.Nf3 e5 2.e4 into a single node', () => {
      const dag = createVariationDAG();
      dag.addMove('e4', 'e2e4', FEN_E4, 'mainline');
      dag.addMove('e5', 'e7e5', FEN_E4_E5, 'mainline');
      const mainline = dag.addMove('Nf3', 'g1f3', FEN_E4_E5_NF3, 'mainline');

      dag.goToRoot();
      dag.addMove('Nf3', 'g1f3', fenAfter(['Nf3']));
      dag.addMove('e5', 'e7e5', fenAfter(['Nf3', 'e5']));
      const transposed = dag.addMove('e4', 'e2e4', fenAfter(['Nf3', 'e5', 'e4']));

      expect(transposed.isTransposition).toBe(true);
      expect(transposed.isNewNode).toBe(false);
      expect(transposed.node.nodeId).toBe(mainline.node.nodeId);
      expect(transposed.node.parentEdges).toHaveLength(2);
      expect(dag.getCurrentNode().nodeId).toBe(mainline.node.nodeId);

      const merged = dag.findNodeByPositionKey(generatePositionKey(FEN_E4_E5_NF3).key);
      expect(merged?.nodeId).toBe(mainline.node.nodeId);
    });

    it('counts nodes, edges, and transpositions correctly after a merge', () => {
      const dag = createVariationDAG();
      dag.addMove('e4', 'e2e4', FEN_E4, 'mainline');
      dag.addMove('e5', 'e7e5', FEN_E4_E5, 'mainline');
      dag.addMove('Nf3', 'g1f3', FEN_E4_E5_NF3, 'mainline');
      dag.goToRoot();
      dag.addMove('Nf3', 'g1f3', fenAfter(['Nf3']));
      dag.addMove('e5', 'e7e5', fenAfter(['Nf3', 'e5']));
      dag.addMove('e4', 'e2e4', fenAfter(['Nf3', 'e5', 'e4']));

      // 6 nodes: root, e4, e4e5, e4e5Nf3 (shared), Nf3, Nf3e5
      // 6 edges: 3 mainline + 2 second path + 1 transposition edge into the shared node
      expect(dag.getStats()).toEqual({
        nodeCount: 6,
        edgeCount: 6,
        transpositionCount: 1,
        maxDepth: 3,
      });
    });
  });

  describe('SAN validation', () => {
    it('throws on an illegal UCI-shaped move and leaves the DAG uncorrupted', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const dag = createVariationDAG();

      // "e2e5" matches the UCI shape but is illegal from the starting position
      expect(() => dag.addMove('e2e5', '', FEN_E4)).toThrow(/Illegal move "e2e5"/);
      expect(dag.getStats()).toEqual({
        nodeCount: 1,
        edgeCount: 0,
        transpositionCount: 0,
        maxDepth: 0,
      });
      expect(dag.getRoot().childEdges).toHaveLength(0);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('converts a legal UCI move passed as SAN via the deprecated fallback', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const dag = createVariationDAG();
      const result = dag.addMove('e2e4', '', FEN_E4);

      expect(result.edge.san).toBe('e4');
      // The empty uci parameter is backfilled from the UCI-shaped san argument
      expect(result.edge.uci).toBe('e2e4');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('PERFORMANCE WARNING'));
    });

    it('accepts non-UCI-shaped garbage SAN without validation', () => {
      // documents current behavior; arguably a bug: only UCI-shaped strings are
      // validated, so an illegal SAN like "zz9" silently creates a node and edge
      // instead of failing fast
      const dag = createVariationDAG();
      const result = dag.addMove('zz9', '', FEN_E4);

      expect(result.isNewNode).toBe(true);
      expect(result.edge.san).toBe('zz9');
      expect(dag.getStats()).toMatchObject({ nodeCount: 2, edgeCount: 1 });
    });
  });

  describe('navigation', () => {
    it('goToFen navigates to a known position and records the visit', () => {
      const dag = createVariationDAG();
      const added = dag.addMove('e4', 'e2e4', FEN_E4);
      dag.addMove('e5', 'e7e5', FEN_E4_E5);
      const visitsBefore = added.node.metadata.visitCount;

      const nav = dag.goToFen(FEN_E4);

      expect(nav.success).toBe(true);
      expect(nav.node?.nodeId).toBe(added.node.nodeId);
      expect(dag.getCurrentNode().nodeId).toBe(added.node.nodeId);
      expect(added.node.metadata.visitCount).toBe(visitsBefore + 1);
    });

    it('goToFen ignores halfmove/fullmove counters via normalization', () => {
      const dag = createVariationDAG();
      const added = dag.addMove('e4', 'e2e4', FEN_E4);
      dag.addMove('e5', 'e7e5', FEN_E4_E5);

      const sameCountersChanged = `${FEN_E4.split(' ').slice(0, 4).join(' ')} 7 42`;
      const nav = dag.goToFen(sameCountersChanged);

      expect(nav.success).toBe(true);
      expect(nav.node?.nodeId).toBe(added.node.nodeId);
    });

    it('goToFen returns a not-found error for unknown positions', () => {
      const dag = createVariationDAG();
      dag.addMove('e4', 'e2e4', FEN_E4);

      const nav = dag.goToFen(FEN_D4);

      expect(nav.success).toBe(false);
      expect(nav.node).toBeUndefined();
      expect(nav.error).toContain('Position not found in tree');
    });

    it('goToRoot returns to the root from any node', () => {
      const dag = createVariationDAG();
      dag.addMove('e4', 'e2e4', FEN_E4);
      dag.addMove('e5', 'e7e5', FEN_E4_E5);

      const nav = dag.goToRoot();

      expect(nav.success).toBe(true);
      expect(nav.node?.nodeId).toBe(dag.getRoot().nodeId);
      expect(dag.getCurrentNode().nodeId).toBe(dag.getRoot().nodeId);
    });

    it('goToParent walks back one move and errors at the root', () => {
      const dag = createVariationDAG();
      const e4 = dag.addMove('e4', 'e2e4', FEN_E4);
      dag.addMove('e5', 'e7e5', FEN_E4_E5);

      const backOne = dag.goToParent();
      expect(backOne.success).toBe(true);
      expect(backOne.node?.nodeId).toBe(e4.node.nodeId);

      dag.goToRoot();
      const atRoot = dag.goToParent();
      expect(atRoot.success).toBe(false);
      expect(atRoot.error).toBe('Already at root node');
    });
  });

  describe('ply bookkeeping', () => {
    it('tracks plies across the mainline and a branch', () => {
      const dag = createVariationDAG();
      const e4 = dag.addMove('e4', 'e2e4', FEN_E4, 'mainline');
      const e5 = dag.addMove('e5', 'e7e5', FEN_E4_E5, 'mainline');
      const nf3 = dag.addMove('Nf3', 'g1f3', FEN_E4_E5_NF3, 'mainline');

      dag.goToFen(FEN_E4);
      const branch = dag.addMove('c5', 'c7c5', FEN_E4_C5);

      expect([e4.node.ply, e5.node.ply, nf3.node.ply]).toEqual([1, 2, 3]);
      expect(branch.node.ply).toBe(2);
      expect(dag.getStats()).toEqual({
        nodeCount: 5,
        edgeCount: 4,
        transpositionCount: 0,
        maxDepth: 3,
      });
    });
  });
});
