/**
 * Tool execution dispatcher
 */

import type { ReferenceGame } from '@chessbeast/database';
import { ChessPosition } from '@chessbeast/pgn';

import { TOOL_NAMES } from './definitions.js';
import type {
  AgenticServices,
  ToolCall,
  ToolResult,
  ToolExecutionStats,
  EvaluatePositionParams,
  EvaluatePositionResult,
  PredictHumanMovesParams,
  PredictHumanMovesResult,
  LookupOpeningParams,
  LookupOpeningResult,
  FindReferenceGamesParams,
  FindReferenceGamesResult,
  MakeMoveParams,
  MakeMoveResult,
} from './types.js';

/**
 * Default depth for Stockfish evaluation
 */
const DEFAULT_DEPTH = 16;
const DEFAULT_MULTIPV = 1;
const DEFAULT_RATING = 1500;
const DEFAULT_GAME_LIMIT = 3;

/**
 * Tool executor that dispatches tool calls to appropriate services
 */
export class ToolExecutor {
  private stats: ToolExecutionStats[] = [];

  constructor(
    private readonly services: AgenticServices,
    private readonly defaultRating: number = DEFAULT_RATING,
  ) {}

  /**
   * Execute a tool call and return the result
   */
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const startTime = Date.now();
    const toolName = toolCall.function.name;

    try {
      const params = JSON.parse(toolCall.function.arguments) as unknown;
      const result = await this.dispatchTool(toolName, params);

      this.recordStats(toolName, Date.now() - startTime, true);

      return {
        toolCallId: toolCall.id,
        result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordStats(toolName, Date.now() - startTime, false, errorMessage);

      return {
        toolCallId: toolCall.id,
        result: null,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute multiple tool calls in parallel
   */
  async executeAll(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    return Promise.all(toolCalls.map((call) => this.execute(call)));
  }

  /**
   * Get execution statistics
   */
  getStats(): ToolExecutionStats[] {
    return [...this.stats];
  }

  /**
   * Get total tool call count
   */
  getToolCallCount(): number {
    return this.stats.length;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = [];
  }

  private async dispatchTool(toolName: string, params: unknown): Promise<unknown> {
    switch (toolName) {
      case TOOL_NAMES.EVALUATE_POSITION:
        return this.evaluatePosition(params as EvaluatePositionParams);

      case TOOL_NAMES.PREDICT_HUMAN_MOVES:
        return this.predictHumanMoves(params as PredictHumanMovesParams);

      case TOOL_NAMES.LOOKUP_OPENING:
        return this.lookupOpening(params as LookupOpeningParams);

      case TOOL_NAMES.FIND_REFERENCE_GAMES:
        return this.findReferenceGames(params as FindReferenceGamesParams);

      case TOOL_NAMES.MAKE_MOVE:
        return this.makeMove(params as MakeMoveParams);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private async evaluatePosition(params: EvaluatePositionParams): Promise<EvaluatePositionResult> {
    const depth = params.depth ?? DEFAULT_DEPTH;
    const multipv = Math.min(Math.max(params.multipv ?? DEFAULT_MULTIPV, 1), 5);

    const response = await this.services.stockfish.evaluate(params.fen, {
      depth,
      multipv,
    });

    // Convert UCI PV to SAN notation
    const pvSan = response.bestLine.length > 0
      ? ChessPosition.convertPvToSan(response.bestLine, params.fen)
      : [];

    const result: EvaluatePositionResult = {
      evaluation: response.cp,
      isMate: response.mate !== 0,
      bestMove: pvSan[0] ?? response.bestLine[0] ?? '',
      principalVariation: pvSan,
      depth: response.depth,
    };

    if (response.mate !== 0) {
      result.mateIn = response.mate;
    }

    // Process alternative lines if multipv > 1
    if (multipv > 1 && response.alternatives && response.alternatives.length > 0) {
      result.alternatives = response.alternatives.map((alt: { cp: number; mate: number; bestLine: string[] }) => {
        const altPvSan = alt.bestLine.length > 0
          ? ChessPosition.convertPvToSan(alt.bestLine, params.fen)
          : [];

        const altResult: NonNullable<EvaluatePositionResult['alternatives']>[number] = {
          evaluation: alt.cp,
          isMate: alt.mate !== 0,
          principalVariation: altPvSan,
        };

        if (alt.mate !== 0) {
          altResult.mateIn = alt.mate;
        }

        return altResult;
      });
    }

    return result;
  }

  private async predictHumanMoves(
    params: PredictHumanMovesParams,
  ): Promise<PredictHumanMovesResult> {
    // Use provided rating or default
    const rating = params.rating ?? this.defaultRating;

    // Maia supports ratings 1100-1900, clamp to valid range
    const clampedRating = Math.min(Math.max(rating, 1100), 1900);

    // Maia service is optional
    if (!this.services.maia) {
      return {
        predictions: [],
        targetRating: clampedRating,
      };
    }

    const response = await this.services.maia.predict(params.fen, clampedRating);

    return {
      predictions: response.predictions.map((p: { move: string; probability: number }) => ({
        move: p.move,
        probability: p.probability,
      })),
      targetRating: clampedRating,
    };
  }

  private async lookupOpening(params: LookupOpeningParams): Promise<LookupOpeningResult> {
    // We need to extract moves from FEN to look up the opening
    // Since we only have FEN, we can try a position-based lookup
    // but ECO database uses move sequences
    // For now, return not found if we can't determine moves

    // Try to see if this is the starting position or very early
    const pos = ChessPosition.fromFen(params.fen);
    const moveNum = pos.moveNumber();

    // If we're at the starting position
    if (params.fen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')) {
      return {
        found: false,
      };
    }

    // For ECO lookup, we'd ideally need the move sequence
    // The tool works better when integrated with full game context
    // For now, return a basic result indicating position-only lookup limitation
    const result: LookupOpeningResult = {
      found: false,
    };

    // If the position is still in the early game, suggest that opening info
    // should be obtained from game context rather than isolated FEN lookup
    if (moveNum <= 15) {
      // Note: In full integration, we'd pass move sequence from game context
    }

    return result;
  }

  private async findReferenceGames(
    params: FindReferenceGamesParams,
  ): Promise<FindReferenceGamesResult> {
    const limit = Math.min(Math.max(params.limit ?? DEFAULT_GAME_LIMIT, 1), 10);

    const result = this.services.lichess.getReferenceGames(params.fen, limit);

    return {
      games: result.games.map((g: ReferenceGame) => {
        const game: FindReferenceGamesResult['games'][number] = {
          white: g.white,
          black: g.black,
          result: g.result,
        };

        if (g.whiteElo !== undefined) {
          game.whiteElo = g.whiteElo;
        }
        if (g.blackElo !== undefined) {
          game.blackElo = g.blackElo;
        }
        if (g.date !== undefined) {
          game.date = g.date;
        }
        if (g.event !== undefined) {
          game.event = g.event;
        }
        if (g.eco !== undefined) {
          game.eco = g.eco;
        }

        return game;
      }),
      totalCount: result.totalCount,
    };
  }

  private async makeMove(params: MakeMoveParams): Promise<MakeMoveResult> {
    try {
      const pos = ChessPosition.fromFen(params.fen);

      // Try to parse as SAN first
      let san = params.move;

      // If move looks like UCI (4-5 chars, no piece letters except promotion)
      if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(params.move)) {
        // Convert UCI to SAN
        san = pos.uciToSan(params.move);
      }

      // Make the move
      const moveResult = pos.move(san);

      // Check position state after move
      const result: MakeMoveResult = {
        success: true,
        fenAfter: moveResult.fenAfter,
        sanMove: moveResult.san,
      };

      const newPos = ChessPosition.fromFen(moveResult.fenAfter);
      if (newPos.isCheck()) {
        result.isCheck = true;
      }
      if (newPos.isCheckmate()) {
        result.isCheckmate = true;
      }
      if (newPos.isStalemate()) {
        result.isStalemate = true;
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid move',
      };
    }
  }

  private recordStats(
    toolName: string,
    durationMs: number,
    success: boolean,
    error?: string,
  ): void {
    const stat: ToolExecutionStats = {
      toolName,
      durationMs,
      success,
    };

    if (error) {
      stat.error = error;
    }

    this.stats.push(stat);
  }
}
