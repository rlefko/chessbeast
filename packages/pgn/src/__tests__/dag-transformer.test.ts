/**
 * Tests for the DAG-to-MoveInfo transformer (Ultra-Fast Coach architecture)
 *
 * Builds tiny hand-rolled DagLike objects from real, legal move sequences
 * (via ChessPosition) so SAN/UCI conversion behaves exactly as in production.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import { ChessPosition, STARTING_FEN } from '../index.js';
import {
  transformDagToMoves,
  countDagMoves,
  getPrincipalVariation,
  type DagNode,
  type DagEdge,
  type DagLike,
} from '../transformer/dag-transformer.js';

/**
 * Per-edge overrides applied while building a line (indexed by move offset).
 */
interface EdgeOverride {
  /** Replace the stored SAN (used to simulate UCI leaking into edge.san) */
  san?: string;
  /** Edge-level comment */
  comment?: string;
  /** Edge-level NAGs */
  nags?: string[];
}

/**
 * Options for TestDag.addLine
 */
interface AddLineOptions {
  /** Whether the first edge of the line is principal (false = side line start) */
  firstEdgePrincipal?: boolean;
  /** Prefix for generated node ids */
  idPrefix?: string;
  /** Overrides keyed by move offset within the line */
  overrides?: Record<number, EdgeOverride>;
}

/**
 * Minimal hand-rolled DAG implementing DagLike for tests.
 *
 * Nodes and edges are built from real move sequences so every FEN is a
 * legal chess position and every stored SAN/UCI pair is legal in context.
 */
class TestDag implements DagLike {
  private readonly nodes = new Map<string, DagNode>();
  private readonly edges = new Map<string, DagEdge>();
  private edgeCount = 0;

  constructor(rootFen: string = STARTING_FEN, rootPly = 0) {
    this.addNode('root', rootFen, rootPly);
  }

  getRoot(): DagNode {
    return this.nodes.get('root')!;
  }

  getNode(nodeId: string): DagNode | undefined {
    return this.nodes.get(nodeId);
  }

  getEdge(edgeId: string): DagEdge | undefined {
    return this.edges.get(edgeId);
  }

  /**
   * Create a node; sideToMove is derived from the FEN's active-color field.
   */
  addNode(nodeId: string, fen: string, ply: number): DagNode {
    const sideToMove: 'w' | 'b' = fen.split(' ')[1] === 'b' ? 'b' : 'w';
    const node: DagNode = { nodeId, fen, ply, sideToMove, childEdges: [] };
    this.nodes.set(nodeId, node);
    return node;
  }

  /**
   * Create an edge between two existing nodes. Principal edges also become
   * the from-node's principalChildEdge.
   */
  addEdge(
    fromNodeId: string,
    toNodeId: string,
    san: string,
    uci: string,
    options: { principal?: boolean; comment?: string; nags?: string[] } = {},
  ): DagEdge {
    const fromNode = this.nodes.get(fromNodeId);
    if (!fromNode) throw new Error(`Unknown from-node: ${fromNodeId}`);

    const edgeId = `edge-${this.edgeCount++}`;
    const edge: DagEdge = {
      edgeId,
      fromNode: fromNodeId,
      toNode: toNodeId,
      san,
      uci,
      nags: options.nags ?? [],
      isPrincipal: options.principal ?? true,
    };
    if (options.comment !== undefined) {
      edge.comment = options.comment;
    }

    fromNode.childEdges.push(edgeId);
    if (edge.isPrincipal) {
      fromNode.principalChildEdge = edgeId;
    }
    this.edges.set(edgeId, edge);
    return edge;
  }

  /**
   * Play a sequence of legal SAN moves starting from an existing node,
   * creating one node + edge per move. The first edge is principal unless
   * firstEdgePrincipal=false (side-line start); continuation edges within
   * the line are always principal. Returns the created node ids in order.
   */
  addLine(fromNodeId: string, sans: string[], options: AddLineOptions = {}): string[] {
    const fromNode = this.nodes.get(fromNodeId);
    if (!fromNode) throw new Error(`Unknown from-node: ${fromNodeId}`);

    const prefix = options.idPrefix ?? fromNodeId;
    const pos = new ChessPosition(fromNode.fen);
    const created: string[] = [];
    let currentId = fromNodeId;
    let ply = fromNode.ply;

    sans.forEach((san, index) => {
      const result = pos.moveWithUci(san);
      ply += 1;
      const nodeId = `${prefix}-${index}`;
      this.addNode(nodeId, result.fenAfter, ply);

      const override = options.overrides?.[index];
      const edgeOptions: { principal?: boolean; comment?: string; nags?: string[] } = {
        principal: index === 0 ? (options.firstEdgePrincipal ?? true) : true,
      };
      if (override?.comment !== undefined) edgeOptions.comment = override.comment;
      if (override?.nags !== undefined) edgeOptions.nags = override.nags;

      this.addEdge(currentId, nodeId, override?.san ?? result.san, result.uci, edgeOptions);
      created.push(nodeId);
      currentId = nodeId;
    });

    return created;
  }
}

/**
 * Build a DAG whose mainline plays the given SAN moves from the start position.
 * Mainline nodes are named main-0, main-1, ... (main-k sits at ply k+1).
 */
function mainlineDag(sans: string[], overrides?: Record<number, EdgeOverride>): TestDag {
  const dag = new TestDag();
  const options: AddLineOptions = { idPrefix: 'main' };
  if (overrides !== undefined) options.overrides = overrides;
  dag.addLine('root', sans, options);
  return dag;
}

/**
 * Compute the FEN reached by playing SAN moves from the start position.
 */
function fenAfter(sans: string[]): string {
  const pos = new ChessPosition();
  for (const san of sans) {
    pos.move(san);
  }
  return pos.fen();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('transformDagToMoves', () => {
  describe('ply placement of pipeline comments and NAGs', () => {
    // pins PR #95/#98 class: comments landed on the wrong ply
    it('attaches a comment keyed by the resulting node ply to exactly that move, not the move before or after', () => {
      const dag = mainlineDag(['e4', 'e5', 'Nf3', 'Nc6']);
      // Ply 2 is the position reached AFTER Black's 1...e5 (moves[1])
      const comments = new Map<number, string>([[2, 'Black stakes a claim in the centre']]);

      const moves = transformDagToMoves(dag, { comments });

      expect(moves).toHaveLength(4);
      expect(moves[1]!.commentAfter).toBe('Black stakes a claim in the centre');
      // Off-by-one probes: neighbors must NOT receive the comment
      expect(moves[0]!.commentAfter).toBeUndefined();
      expect(moves[2]!.commentAfter).toBeUndefined();
      expect(moves[3]!.commentAfter).toBeUndefined();
    });

    // pins PR #95/#98 class: first-move boundary
    it('attaches a ply-1 comment to the first move only', () => {
      const dag = mainlineDag(['e4', 'e5']);
      const comments = new Map<number, string>([[1, 'The king pawn opening']]);

      const moves = transformDagToMoves(dag, { comments });

      expect(moves[0]!.commentAfter).toBe('The king pawn opening');
      expect(moves[1]!.commentAfter).toBeUndefined();
    });

    it('derives moveNumber from the from-node ply and isWhiteMove from the from-node side to move', () => {
      const dag = mainlineDag(['e4', 'e5', 'Nf3', 'Nc6']);

      const moves = transformDagToMoves(dag);

      expect(moves.map((m) => [m.moveNumber, m.isWhiteMove, m.san])).toEqual([
        [1, true, 'e4'],
        [1, false, 'e5'],
        [2, true, 'Nf3'],
        [2, false, 'Nc6'],
      ]);
    });

    it('derives numbering correctly for lines starting mid-game and for Black-to-move roots', () => {
      // Root at ply 8 (White to move) -> first move is 5.O-O
      const ruyFen = fenAfter(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6']);
      const midGame = new TestDag(ruyFen, 8);
      midGame.addLine('root', ['O-O', 'Be7'], { idPrefix: 'main' });

      const midMoves = transformDagToMoves(midGame);
      expect(midMoves[0]!.moveNumber).toBe(5);
      expect(midMoves[0]!.isWhiteMove).toBe(true);
      expect(midMoves[1]!.moveNumber).toBe(5);
      expect(midMoves[1]!.isWhiteMove).toBe(false);

      // Root at ply 1 (Black to move) -> first move is 1...c5
      const blackRoot = new TestDag(fenAfter(['e4']), 1);
      blackRoot.addLine('root', ['c5'], { idPrefix: 'main' });

      const blackMoves = transformDagToMoves(blackRoot);
      expect(blackMoves[0]!.moveNumber).toBe(1);
      expect(blackMoves[0]!.isWhiteMove).toBe(false);
      expect(blackMoves[0]!.san).toBe('c5');
    });

    it('attaches NAGs keyed by the resulting node ply to exactly that move', () => {
      const dag = mainlineDag(['e4', 'e5', 'Nf3', 'Nc6']);
      const nags = new Map<number, string[]>([[3, ['$2']]]);

      const moves = transformDagToMoves(dag, { nags });

      expect(moves[2]!.nags).toEqual(['$2']);
      expect(moves[1]!.nags).toBeUndefined();
      expect(moves[3]!.nags).toBeUndefined();
    });
  });

  describe('UCI-leak defense in edge.san', () => {
    // pins PR #100: UCI strings leaked into edge.san and rendered raw in PGN
    it('converts a UCI string leaked into edge.san to real SAN and emits a console.warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const dag = mainlineDag(['e4', 'e5', 'Nf3'], {
        0: { san: 'e2e4' },
        2: { san: 'g1f3' },
      });

      const moves = transformDagToMoves(dag);

      expect(moves[0]!.san).toBe('e4');
      expect(moves[2]!.san).toBe('Nf3');
      expect(moves[1]!.san).toBe('e5');
      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('e2e4'));
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('keeps the original string and logs an error (without throwing) when leaked UCI is illegal in the from-position', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // Override Black's reply with "e2e4": UCI-shaped, but illegal with Black to move
      const dag = mainlineDag(['e4', 'e5'], { 1: { san: 'e2e4' } });

      let moves: ReturnType<typeof transformDagToMoves> = [];
      expect(() => {
        moves = transformDagToMoves(dag);
      }).not.toThrow();

      expect(moves[1]!.san).toBe('e2e4');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to convert'));
    });

    it('leaves genuine SAN untouched and never warns, even when moves name squares', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const dag = mainlineDag(['e4', 'd5', 'exd5', 'Qxd5']);

      const moves = transformDagToMoves(dag);

      expect(moves.map((m) => m.san)).toEqual(['e4', 'd5', 'exd5', 'Qxd5']);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('detects uppercase-promotion UCI ("e7e8Q") as UCI; lowercase converts but uppercase currently leaks through', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const promoFen = '8/4P1k1/8/8/8/8/8/4K3 w - - 0 1';

      // Uppercase promotion char: detected as UCI (warn fires)...
      const upper = new TestDag(promoFen, 12);
      upper.addLine('root', ['e8=Q'], { idPrefix: 'main', overrides: { 0: { san: 'e7e8Q' } } });
      const upperMoves = transformDagToMoves(upper);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      // documents current behavior; arguably a bug: isUciFormat accepts an
      // uppercase promotion piece, but ChessPosition.uciToSan forwards the
      // promotion char case-sensitively and chess.js rejects "Q", so the
      // conversion fails and the raw UCI string is kept in the output.
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(upperMoves[0]!.san).toBe('e7e8Q');

      // ...whereas lowercase promotion UCI converts cleanly to SAN.
      const lower = new TestDag(promoFen, 12);
      lower.addLine('root', ['e8=Q'], { idPrefix: 'main', overrides: { 0: { san: 'e7e8q' } } });
      const lowerMoves = transformDagToMoves(lower);

      expect(lowerMoves[0]!.san).toBe('e8=Q');
      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('pipeline vs edge-level comment/NAG precedence', () => {
    it('pipeline comments take precedence over edge-level comments for the same ply', () => {
      const dag = mainlineDag(['e4'], { 0: { comment: 'edge comment' } });
      const comments = new Map<number, string>([[1, 'pipeline comment']]);

      const moves = transformDagToMoves(dag, { comments });

      expect(moves[0]!.commentAfter).toBe('pipeline comment');
    });

    it('pipeline NAGs take precedence over edge-level NAGs for the same ply', () => {
      const dag = mainlineDag(['e4'], { 0: { nags: ['$6'] } });
      const nags = new Map<number, string[]>([[1, ['$1', '$18']]]);

      const moves = transformDagToMoves(dag, { nags });

      expect(moves[0]!.nags).toEqual(['$1', '$18']);
    });

    it('falls back to edge-level comments when the comments map has no entry for that ply', () => {
      const dag = mainlineDag(['e4', 'e5'], { 0: { comment: 'edge comment on e4' } });
      const comments = new Map<number, string>([[2, 'pipeline comment on e5']]);

      const moves = transformDagToMoves(dag, { comments });

      expect(moves[0]!.commentAfter).toBe('edge comment on e4');
      expect(moves[1]!.commentAfter).toBe('pipeline comment on e5');
    });

    it('falls back to edge-level NAGs when the pipeline entry is missing or an empty list', () => {
      const dag = mainlineDag(['e4', 'e5'], {
        0: { nags: ['$6'] },
        1: { nags: ['$5'] },
      });
      // Empty pipeline list for ply 1 does not shadow the edge NAGs;
      // no entry at all for ply 2 also falls back
      const nags = new Map<number, string[]>([[1, []]]);

      const moves = transformDagToMoves(dag, { nags });

      expect(moves[0]!.nags).toEqual(['$6']);
      expect(moves[1]!.nags).toEqual(['$5']);
    });
  });

  describe('meaningful-variation filter', () => {
    // pins PR #98/#99 class: bare engine lines flooded the PGN output
    it('drops a bare variation that has no comment, no NAGs, and no nested lines', () => {
      const dag = mainlineDag(['e4', 'e5', 'Nf3']);
      // Bare alternative to 1...e5
      dag.addLine('main-0', ['c5'], { firstEdgePrincipal: false, idPrefix: 'bare' });

      const moves = transformDagToMoves(dag);

      expect(moves[1]!.variations).toBeUndefined();
    });

    it('keeps variations whose first move carries a comment or NAGs, preserving branch order', () => {
      const dag = mainlineDag(['e4', 'e5', 'Nf3']);
      dag.addLine('main-0', ['c5'], {
        firstEdgePrincipal: false,
        idPrefix: 'sicilian',
        overrides: { 0: { comment: 'The Sicilian' } },
      });
      dag.addLine('main-0', ['c6'], {
        firstEdgePrincipal: false,
        idPrefix: 'carokann',
        overrides: { 0: { nags: ['$5'] } },
      });
      dag.addLine('main-0', ['d6'], { firstEdgePrincipal: false, idPrefix: 'bare' });

      const moves = transformDagToMoves(dag);
      const variations = moves[1]!.variations;

      expect(variations).toBeDefined();
      expect(variations).toHaveLength(2);
      expect(variations![0]![0]!.san).toBe('c5');
      expect(variations![0]![0]!.commentAfter).toBe('The Sicilian');
      expect(variations![1]![0]!.san).toBe('c6');
      expect(variations![1]![0]!.nags).toEqual(['$5']);
    });

    it('keeps a bare variation whose first move gains nested variations', () => {
      const dag = mainlineDag(['e4', 'e5', 'Nf3']);
      // Side line 1...c5 2.Nc3 with an alternative 2.Nf3 branching after 1...c5
      dag.addLine('main-0', ['c5', 'Nc3'], { firstEdgePrincipal: false, idPrefix: 'sic' });
      dag.addLine('sic-0', ['Nf3'], { firstEdgePrincipal: false, idPrefix: 'open' });

      const moves = transformDagToMoves(dag);
      const variations = moves[1]!.variations;

      expect(variations).toBeDefined();
      expect(variations).toHaveLength(1);
      const line = variations![0]!;
      expect(line.map((m) => m.san)).toEqual(['c5', 'Nc3']);
      // documents current behavior; arguably a bug: the alternative 2.Nf3
      // branches at the node AFTER 1...c5 (it is an alternative to 2.Nc3),
      // but attachVariationsToLine attaches it to the variation's FIRST move
      // (its "skip the first move" comment is not implemented). The nested
      // line is also bare, yet kept: nested variations bypass the
      // meaningful-variation filter applied at the top level.
      expect(line[0]!.variations).toBeDefined();
      expect(line[0]!.variations![0]![0]!.san).toBe('Nf3');
      expect(line[1]!.variations).toBeUndefined();
    });
  });

  describe('structural limits', () => {
    it('truncates the principal path at maxVariationMoves', () => {
      const sans = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'];
      const dag = mainlineDag(sans);

      const truncated = transformDagToMoves(dag, { maxVariationMoves: 4 });
      expect(truncated).toHaveLength(4);
      expect(truncated[3]!.san).toBe('Nc6');

      const full = transformDagToMoves(dag);
      expect(full).toHaveLength(6);
      expect(full.map((m) => m.san)).toEqual(sans);
    });

    it('stops nesting variations at maxVariationDepth', () => {
      const dag = mainlineDag(['e4', 'e5', 'Nf3']);
      dag.addLine('main-0', ['c5', 'Nc3'], {
        firstEdgePrincipal: false,
        idPrefix: 'sic',
        overrides: { 0: { comment: 'The Sicilian' } },
      });
      dag.addLine('sic-0', ['Nf3'], { firstEdgePrincipal: false, idPrefix: 'open' });

      // Depth 1: the side line itself is emitted, but no nested variations
      const shallow = transformDagToMoves(dag, { maxVariationDepth: 1 });
      const shallowLine = shallow[1]!.variations![0]!;
      expect(shallowLine.map((m) => m.san)).toEqual(['c5', 'Nc3']);
      expect(shallowLine[0]!.variations).toBeUndefined();

      // Default depth (3): the nested alternative appears
      const deep = transformDagToMoves(dag);
      const deepLine = deep[1]!.variations![0]!;
      expect(deepLine[0]!.variations).toBeDefined();
      expect(deepLine[0]!.variations![0]![0]!.san).toBe('Nf3');
    });

    it('omits all variations when principalOnly is set', () => {
      const dag = mainlineDag(['e4', 'e5', 'Nf3']);
      dag.addLine('main-0', ['c5'], {
        firstEdgePrincipal: false,
        idPrefix: 'sicilian',
        overrides: { 0: { comment: 'The Sicilian' } },
      });

      const moves = transformDagToMoves(dag, { principalOnly: true });

      expect(moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3']);
      expect(moves.every((m) => m.variations === undefined)).toBe(true);
    });
  });
});

describe('countDagMoves', () => {
  it('counts each edge exactly once when two paths transpose into a shared node', () => {
    const dag = new TestDag();
    // Path 1: 1.d4 d5 2.c4 (3 edges, ends at p1-2)
    dag.addLine('root', ['d4', 'd5', 'c4'], { idPrefix: 'p1' });
    // Path 2: 1.c4 d5 (2 edges) then 2.d4 converging into the SAME node p1-2
    dag.addLine('root', ['c4', 'd5'], { firstEdgePrincipal: false, idPrefix: 'p2' });
    dag.addEdge('p2-1', 'p1-2', 'd4', 'd2d4', { principal: true });
    // Shared continuation: 2...e6 (1 edge) - must be counted once, not twice
    dag.addLine('p1-2', ['e6'], { idPrefix: 'shared' });

    // 3 (path 1) + 2 (path 2) + 1 (converging d4) + 1 (shared e6) = 7
    expect(countDagMoves(dag)).toBe(7);
  });
});

describe('getPrincipalVariation', () => {
  it('returns the SAN of principal edges in path order, ignoring side lines', () => {
    const dag = mainlineDag(['e4', 'e5', 'Nf3', 'Nc6']);
    dag.addLine('main-0', ['c5'], {
      firstEdgePrincipal: false,
      idPrefix: 'sicilian',
      overrides: { 0: { comment: 'The Sicilian' } },
    });

    expect(getPrincipalVariation(dag)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('follows principal edges through a transposition node to the end of the path', () => {
    const dag = new TestDag();
    dag.addLine('root', ['d4', 'd5', 'c4'], { idPrefix: 'p1' });
    dag.addLine('root', ['c4', 'd5'], { firstEdgePrincipal: false, idPrefix: 'p2' });
    dag.addEdge('p2-1', 'p1-2', 'd4', 'd2d4', { principal: true });
    dag.addLine('p1-2', ['e6'], { idPrefix: 'shared' });

    expect(getPrincipalVariation(dag)).toEqual(['d4', 'd5', 'c4', 'e6']);
  });
});
