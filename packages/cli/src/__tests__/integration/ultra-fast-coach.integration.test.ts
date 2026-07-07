/**
 * Integration tests for the Ultra-Fast Coach runner
 *
 * Exercises runUltraFastCoachFull and runUltraFastCoachAnnotation end to end
 * with a chess-aware mock engine (legal PVs derived via ChessPosition) and a
 * mock LLM client injected through the Services.llmClient seam.
 */

import {
  createArtifactCache,
  DEFAULT_CACHE_CONFIG,
  type GameAnalysis,
  type MoveAnalysis,
  type CriticalMoment,
} from '@chessbeast/core';
import type { StockfishClient } from '@chessbeast/grpc-client';
import type { OpenAIClient } from '@chessbeast/llm';
import { ChessPosition, renderPgn, type MoveInfo, type ParsedGame } from '@chessbeast/pgn';
import { describe, it, expect, vi, type Mock } from 'vitest';

import { DEFAULT_CONFIG } from '../../config/defaults.js';
import type { ChessBeastConfig } from '../../config/schema.js';
import type { Services } from '../../orchestrator/services.js';
import {
  runUltraFastCoachFull,
  runUltraFastCoachAnnotation,
} from '../../orchestrator/ultra-fast-coach-runner.js';
import { ProgressReporter } from '../../progress/reporter.js';

/**
 * UCI move token pattern (e.g., "e2e4", "e7e8q") - must never appear in output
 */
const UCI_TOKEN_PATTERN = /\b[a-h][1-8][a-h][1-8][qrbn]?\b/;

/**
 * Deterministic comment returned by the mock LLM (contains no UCI tokens)
 */
const MOCK_COMMENT =
  'A sharp moment; the knight grab loosens the kingside and invites a counterattack.';

/**
 * The Blackburne Shilling Gambit trap - a short, fully legal game with
 * clear blunders at known plies:
 *   1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5?? Qg5 5. Nxf7? Qxg2 6. Rf1 Qxe4+ 7. Be2?? Nf3#
 */
const GAME_SANS: readonly string[] = [
  'e4', // ply 0
  'e5', // ply 1
  'Nf3', // ply 2
  'Nc6', // ply 3
  'Bc4', // ply 4
  'Nd4', // ply 5
  'Nxe5', // ply 6 - blunder (critical moment)
  'Qg5', // ply 7
  'Nxf7', // ply 8 - mistake (critical moment)
  'Qxg2', // ply 9
  'Rf1', // ply 10
  'Qxe4+', // ply 11
  'Be2', // ply 12 - blunder (critical moment)
  'Nf3#', // ply 13
];

const BLUNDER_PLY = 6;
const MISTAKE_PLY = 8;
const SECOND_BLUNDER_PLY = 12;
const CRITICAL_PLIES = [BLUNDER_PLY, MISTAKE_PLY, SECOND_BLUNDER_PLY];

/**
 * Build MoveAnalysis[] for the fixture game by replaying it through
 * ChessPosition, so every fenBefore/fenAfter is real and legal.
 */
function buildMoves(): MoveAnalysis[] {
  const position = new ChessPosition();
  return GAME_SANS.map((san, plyIndex): MoveAnalysis => {
    const fenBefore = position.fen();
    position.move(san);
    const fenAfter = position.fen();
    return {
      plyIndex,
      moveNumber: Math.floor(plyIndex / 2) + 1,
      isWhiteMove: plyIndex % 2 === 0,
      san,
      fenBefore,
      fenAfter,
      evalBefore: { cp: 20, depth: 12, pv: [] },
      evalAfter: { cp: 20, depth: 12, pv: [] },
      bestMove: san,
      cpLoss: 0,
      classification: 'good',
      isCriticalMoment: false,
    };
  });
}

/**
 * Build a GameAnalysis with three injected critical moments at known plies.
 */
function buildAnalysis(): GameAnalysis {
  const moves = buildMoves();

  moves[BLUNDER_PLY]!.classification = 'blunder';
  moves[BLUNDER_PLY]!.cpLoss = 350;
  moves[BLUNDER_PLY]!.isCriticalMoment = true;

  moves[MISTAKE_PLY]!.classification = 'mistake';
  moves[MISTAKE_PLY]!.cpLoss = 180;
  moves[MISTAKE_PLY]!.isCriticalMoment = true;

  moves[SECOND_BLUNDER_PLY]!.classification = 'blunder';
  moves[SECOND_BLUNDER_PLY]!.cpLoss = 900;
  moves[SECOND_BLUNDER_PLY]!.isCriticalMoment = true;

  const criticalMoments: CriticalMoment[] = [
    { plyIndex: BLUNDER_PLY, type: 'eval_swing', score: 90, reason: 'Knight grab loses material' },
    { plyIndex: MISTAKE_PLY, type: 'eval_swing', score: 75, reason: 'Fork misses the danger' },
    {
      plyIndex: SECOND_BLUNDER_PLY,
      type: 'missed_win',
      score: 95,
      reason: 'Walks into forced mate',
    },
  ];

  return {
    metadata: {
      white: 'White Player',
      black: 'Black Player',
      result: '0-1',
      event: 'Test Game',
    },
    moves,
    criticalMoments,
    stats: {
      totalMoves: Math.ceil(moves.length / 2),
      totalPlies: moves.length,
      white: {
        averageCpLoss: 100,
        inaccuracies: 0,
        mistakes: 1,
        blunders: 2,
        excellentMoves: 0,
        brilliantMoves: 0,
        accuracy: 60,
      },
      black: {
        averageCpLoss: 5,
        inaccuracies: 0,
        mistakes: 0,
        blunders: 0,
        excellentMoves: 3,
        brilliantMoves: 1,
        accuracy: 98,
      },
      phaseTransitions: [{ toPly: 0, phase: 'opening' }],
    },
  };
}

/**
 * Engine evaluation line shape matching StockfishClient.evaluate()
 */
interface MockEvalLine {
  cp: number;
  mate: number;
  depth: number;
  bestLine: string[];
  alternatives: MockEvalLine[];
}

interface MockEvaluateOptions {
  depth?: number;
  multipv?: number;
  timeLimitMs?: number;
  mateMinTimeMs?: number;
}

interface MockStockfish {
  evaluate: Mock<(fen: string, options?: MockEvaluateOptions) => Promise<MockEvalLine>>;
  healthCheck: Mock<() => Promise<{ healthy: boolean; version: string }>>;
}

/**
 * Create a chess-aware mock Stockfish client. PVs are always legal move
 * sequences (in UCI) derived from the position via ChessPosition, so the
 * explorer and PV-to-SAN conversion operate on valid data.
 */
function createMockStockfish(options: { failFens?: Set<string> } = {}): MockStockfish {
  const evaluate = vi.fn(
    async (fen: string, evalOptions: MockEvaluateOptions = {}): Promise<MockEvalLine> => {
      if (options.failFens?.has(fen)) {
        throw new Error(`mock engine failure for position: ${fen}`);
      }

      const position = new ChessPosition(fen);
      const depth = evalOptions.depth ?? 12;
      const legalMoves = position.getLegalMoves();

      if (legalMoves.length === 0) {
        // Terminal position (checkmate/stalemate) - no PV
        return { cp: 0, mate: 0, depth, bestLine: [], alternatives: [] };
      }

      // Build a 3-ply PV by repeatedly playing the first legal move
      const pv: string[] = [];
      const walker = position.clone();
      for (let i = 0; i < 3; i++) {
        const nextMoves = walker.getLegalMoves();
        if (nextMoves.length === 0) break;
        const san = nextMoves[0]!;
        pv.push(walker.sanToUci(san));
        walker.move(san);
      }

      // Alternatives for multipv requests: distinct first moves
      const alternatives: MockEvalLine[] = [];
      const multipv = evalOptions.multipv ?? 1;
      for (let i = 1; i < Math.min(multipv, legalMoves.length); i++) {
        const san = legalMoves[i]!;
        alternatives.push({
          cp: 30 - i * 20,
          mate: 0,
          depth,
          bestLine: [position.sanToUci(san)],
          alternatives: [],
        });
      }

      return { cp: 30, mate: 0, depth, bestLine: pv, alternatives };
    },
  );

  const healthCheck = vi.fn(async (): Promise<{ healthy: boolean; version: string }> => {
    return { healthy: true, version: 'mock-stockfish' };
  });

  return { evaluate, healthCheck };
}

interface MockChatMessage {
  role: string;
  content: string;
}

interface MockChatRequest {
  messages: MockChatMessage[];
  temperature?: number;
}

interface MockChatResponse {
  content: string;
  finishReason: 'stop';
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

interface MockLlmClient {
  chat: Mock<(request: MockChatRequest) => Promise<MockChatResponse>>;
}

/**
 * Create a mock LLM client that structurally matches the OpenAIClient
 * surface used by the post-write pipeline (Narrator calls client.chat()).
 */
function createMockLlmClient(options: { failWhenPromptIncludes?: string } = {}): MockLlmClient {
  const chat = vi.fn(async (request: MockChatRequest): Promise<MockChatResponse> => {
    const userPrompt = request.messages[request.messages.length - 1]?.content ?? '';
    if (
      options.failWhenPromptIncludes !== undefined &&
      userPrompt.includes(options.failWhenPromptIncludes)
    ) {
      throw new Error('mock LLM unavailable');
    }
    return {
      content: MOCK_COMMENT,
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 25, totalTokens: 125 },
    };
  });

  return { chat };
}

/**
 * Build a minimal Services container around the mocks.
 * The mock objects are structurally partial, so they are cast via unknown
 * (not `any`) to the client types the runner expects.
 */
function createServices(engine: MockStockfish, llm: MockLlmClient): Services {
  return {
    stockfish: engine as unknown as StockfishClient,
    sf16: null,
    maia: null,
    ecoClient: null,
    lichessClient: null,
    cache: createArtifactCache(DEFAULT_CACHE_CONFIG),
    llmClient: llm as unknown as OpenAIClient,
  };
}

/**
 * Build a ChessBeastConfig from package defaults with test overrides.
 */
function buildConfig(
  overrides: {
    apiKey?: string;
    tokenBudget?: number;
    commentDensity?: 'sparse' | 'normal' | 'verbose';
  } = {},
): ChessBeastConfig {
  const config = structuredClone(DEFAULT_CONFIG);
  if (overrides.apiKey !== undefined) {
    config.llm.apiKey = overrides.apiKey;
  }
  if (overrides.tokenBudget !== undefined) {
    config.llm.tokenBudget = overrides.tokenBudget;
  }
  if (overrides.commentDensity !== undefined) {
    config.ultraFastCoach.commentDensity = overrides.commentDensity;
  }
  return config;
}

function createSilentReporter(): ProgressReporter {
  return new ProgressReporter({ silent: true });
}

/**
 * Recursively collect all MoveInfo entries (mainline + nested variations)
 */
function collectAllMoveInfos(moves: MoveInfo[]): MoveInfo[] {
  const collected: MoveInfo[] = [];
  for (const move of moves) {
    collected.push(move);
    if (move.variations) {
      for (const variation of move.variations) {
        collected.push(...collectAllMoveInfos(variation));
      }
    }
  }
  return collected;
}

describe('Ultra-Fast Coach runner integration', () => {
  // pins PR #90/#93: runs used to complete with zero annotations
  it('generates comments and explores nodes when >=3 critical moments are injected', async () => {
    const analysis = buildAnalysis();
    const llm = createMockLlmClient();
    const services = createServices(createMockStockfish(), llm);

    const result = await runUltraFastCoachFull(
      analysis,
      buildConfig({ apiKey: 'test-api-key' }),
      services,
      createSilentReporter(),
    );

    // One comment per injected critical moment at minimum (blunder/mistake
    // intents are mandatory and survive density/redundancy filtering)
    expect(result.commentsGenerated).toBeGreaterThanOrEqual(CRITICAL_PLIES.length);
    expect(result.nodesExplored).toBeGreaterThan(0);
    // Mock LLM reports 125 tokens per call, so token accounting must be wired
    expect(result.tokensUsed).toBeGreaterThan(0);
    // The injected mock client (Services.llmClient seam) must be the one used
    expect(llm.chat).toHaveBeenCalled();
  });

  // pins PR #100: UCI moves leaked into SAN fields and rendered PGN
  it('produces SAN-only output with no UCI tokens in moves, comments, or rendered PGN', async () => {
    const analysis = buildAnalysis();
    const services = createServices(createMockStockfish(), createMockLlmClient());

    const result = await runUltraFastCoachFull(
      analysis,
      buildConfig({ apiKey: 'test-api-key' }),
      services,
      createSilentReporter(),
    );

    const allMoves = collectAllMoveInfos(result.annotatedMoves);
    expect(allMoves.length).toBeGreaterThanOrEqual(GAME_SANS.length);
    for (const move of allMoves) {
      expect(move.san).not.toMatch(UCI_TOKEN_PATTERN);
      if (move.commentAfter !== undefined) {
        expect(move.commentAfter).not.toMatch(UCI_TOKEN_PATTERN);
      }
    }

    const game: ParsedGame = {
      metadata: {
        white: analysis.metadata.white,
        black: analysis.metadata.black,
        result: analysis.metadata.result,
      },
      moves: result.annotatedMoves,
    };
    const pgn = renderPgn(game);
    expect(pgn).toContain('1. e4');
    expect(pgn).not.toMatch(UCI_TOKEN_PATTERN);
  });

  // pins the DAG mainline integrity that PR #100 restored: the annotated
  // mainline must be exactly the input game, in order
  it('preserves the input mainline moves in the annotated output', async () => {
    const analysis = buildAnalysis();
    const services = createServices(createMockStockfish(), createMockLlmClient());

    const result = await runUltraFastCoachFull(
      analysis,
      buildConfig({ apiKey: 'test-api-key' }),
      services,
      createSilentReporter(),
    );

    expect(result.annotatedMoves.map((m) => m.san)).toEqual([...GAME_SANS]);
    expect(result.annotatedMoves.map((m) => m.isWhiteMove)).toEqual(
      GAME_SANS.map((_, i) => i % 2 === 0),
    );
  });

  // pins PR #95: comments landed on the wrong ply (ply 0/1 instead of the
  // critical moments they describe)
  it('places comments on the plies of the injected critical moments, never on ply 0/1', async () => {
    const analysis = buildAnalysis();
    const services = createServices(createMockStockfish(), createMockLlmClient());

    await runUltraFastCoachAnnotation(
      analysis,
      buildConfig({ apiKey: 'test-api-key' }),
      services,
      createSilentReporter(),
    );

    // Every injected critical moment gets a comment on its own ply
    for (const ply of CRITICAL_PLIES) {
      expect(analysis.moves[ply]!.comment).toBeDefined();
      expect(analysis.moves[ply]!.comment!.length).toBeGreaterThan(0);
    }

    // The opening plies are untouched
    expect(analysis.moves[0]!.comment).toBeUndefined();
    expect(analysis.moves[1]!.comment).toBeUndefined();

    // All comments cluster around the injected moments (within one ply -
    // exploration intents may narrate the position entering the moment)
    const commentedPlies = analysis.moves
      .filter((m) => m.comment !== undefined)
      .map((m) => m.plyIndex);
    for (const ply of commentedPlies) {
      const nearMoment = CRITICAL_PLIES.some((critical) => Math.abs(critical - ply) <= 1);
      expect(nearMoment).toBe(true);
    }
  });

  // pins PR #94: LLM failures were silently swallowed; they must surface as
  // warnings while the remaining moments still get annotated
  it('surfaces LLM failures as warnings and falls back without dropping other annotations', async () => {
    const analysis = buildAnalysis();
    // Fail every prompt that mentions the first blunder move
    const llm = createMockLlmClient({ failWhenPromptIncludes: 'Nxe5' });
    const services = createServices(createMockStockfish(), llm);

    const result = await runUltraFastCoachFull(
      analysis,
      buildConfig({ apiKey: 'test-api-key' }),
      services,
      createSilentReporter(),
    );

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('Failed to generate comment'))).toBe(true);

    // Other moments still received the LLM comment
    const commentsByPly = new Map(
      result.annotatedMoves.map((m, i) => [i, m.commentAfter] as const),
    );
    expect(commentsByPly.get(MISTAKE_PLY)).toBe(MOCK_COMMENT);
    expect(commentsByPly.get(SECOND_BLUNDER_PLY)).toBe(MOCK_COMMENT);

    // The failing moment falls back to a template comment instead of vanishing
    const blunderComment = commentsByPly.get(BLUNDER_PLY);
    expect(blunderComment).toBeDefined();
    expect(blunderComment!.length).toBeGreaterThan(0);
    expect(blunderComment).not.toBe(MOCK_COMMENT);
  });

  it('degrades gracefully when the engine throws for one critical position', async () => {
    const analysis = buildAnalysis();
    const failingFen = analysis.moves[MISTAKE_PLY]!.fenBefore;
    const engine = createMockStockfish({ failFens: new Set([failingFen]) });
    const services = createServices(engine, createMockLlmClient());

    const result = await runUltraFastCoachFull(
      analysis,
      buildConfig({ apiKey: 'test-api-key' }),
      services,
      createSilentReporter(),
    );

    // The run completes and the other moments are still explored and annotated
    expect(result.nodesExplored).toBeGreaterThan(0);
    expect(result.commentsGenerated).toBeGreaterThanOrEqual(CRITICAL_PLIES.length);
    const commentedIndexes = result.annotatedMoves
      .map((m, i) => (m.commentAfter !== undefined ? i : -1))
      .filter((i) => i >= 0);
    expect(commentedIndexes).toContain(BLUNDER_PLY);
    expect(commentedIndexes).toContain(SECOND_BLUNDER_PLY);
    // The failing moment still gets its mandatory played-move comment
    expect(commentedIndexes).toContain(MISTAKE_PLY);

    // Documents current behavior; arguably a bug: engine evaluation failures
    // inside exploration are swallowed (console.warn only) and never surface
    // in result.warnings, so callers cannot tell the engine misbehaved.
    expect(result.warnings.some((w) => w.includes('Exploration failed'))).toBe(false);
  });

  // pins PR #97: explored variations were discovered but never applied to
  // the GameAnalysis moves
  it('applies explored variations to analysis moves with purpose and source fields', async () => {
    const analysis = buildAnalysis();
    const services = createServices(createMockStockfish(), createMockLlmClient());

    await runUltraFastCoachAnnotation(
      analysis,
      buildConfig({ apiKey: 'test-api-key', commentDensity: 'verbose' }),
      services,
      createSilentReporter(),
    );

    const movesWithVariations = analysis.moves.filter(
      (m) => m.exploredVariations !== undefined && m.exploredVariations.length > 0,
    );
    expect(movesWithVariations.length).toBeGreaterThan(0);

    for (const move of movesWithVariations) {
      // Variations attach adjacent to the injected critical moments
      const nearMoment = CRITICAL_PLIES.some((critical) => Math.abs(critical - move.plyIndex) <= 1);
      expect(nearMoment).toBe(true);

      for (const variation of move.exploredVariations!) {
        expect(variation.purpose).toBe('best');
        expect(variation.source).toBe('engine');
        expect(variation.moves.length).toBeGreaterThan(0);
        for (const san of variation.moves) {
          expect(san).not.toMatch(UCI_TOKEN_PATTERN);
        }
      }
    }
  });

  // Token budget smoke test: with an injected client the budget only feeds
  // the (unused) fallback LLM config, so we can only pin that wiring it up
  // does not break the run and the injected client is still used.
  it('accepts a configured token budget and still routes through the injected client', async () => {
    const analysis = buildAnalysis();
    const llm = createMockLlmClient();
    const services = createServices(createMockStockfish(), llm);
    // No apiKey on purpose: constructing a real OpenAIClient would require
    // one, so a successful run proves services.llmClient short-circuits it.
    const config = buildConfig({ tokenBudget: 5000 });

    const commentCount = await runUltraFastCoachAnnotation(
      analysis,
      config,
      services,
      createSilentReporter(),
    );

    expect(commentCount).toBeGreaterThan(0);
    expect(llm.chat).toHaveBeenCalled();
  });
});
