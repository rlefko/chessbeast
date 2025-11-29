/**
 * Agentic Variation Explorer
 *
 * A fully agentic system where the LLM controls exploration through tools:
 * - Navigate positions with push_move/pop_move
 * - Create sub-variations with start_branch/end_branch
 * - Add annotations with add_comment/add_nag
 * - Query engine/Maia for analysis
 * - Self-regulate stopping with assess_continuation
 *
 * The LLM decides what to explore, how deep to go, and when to stop.
 */

import { ChessPosition, renderBoard, formatBoardForPrompt } from '@chessbeast/pgn';

import { ResponseCache } from '../cache/response-cache.js';
import type { OpenAIClient } from '../client/openai-client.js';
import type { ChatMessage, ToolChoice } from '../client/types.js';
import type { LLMConfig } from '../config/llm-config.js';
import { ToolExecutor } from '../tools/executor.js';
import type { AgenticServices, ToolCall, EvaluatePositionResult } from '../tools/types.js';

import { ExplorationState, type ExploredMove } from './exploration-state.js';
import { EXPLORATION_TOOLS } from './exploration-tools.js';
import {
  assessContinuation,
  getBudgetGuidance,
  type StoppingConfig,
  DEFAULT_STOPPING_CONFIG,
} from './stopping-heuristics.js';
import type { ExploredLine, LinePurpose } from './variation-explorer.js';

/**
 * Configuration for the agentic explorer
 */
export interface AgenticExplorerConfig {
  /** Hard cap on tool calls (default: 40) */
  maxToolCalls?: number;
  /** Soft cap that triggers wrap-up guidance (default: 25) */
  softToolCap?: number;
  /** Maximum variation depth in moves (default: 50) */
  maxDepth?: number;
  /** Maximum number of branches/sub-variations (default: 5) */
  maxBranches?: number;
  /** Target rating for human-move predictions */
  targetRating?: number;
}

/**
 * Progress callback information
 */
export interface AgenticExplorerProgress {
  phase: 'starting' | 'exploring' | 'branching' | 'finishing';
  toolCalls: number;
  currentDepth: number;
  branchCount: number;
  lastTool?: string | undefined;
  /** Rich tool information for debug logging */
  toolArgs?: Record<string, unknown> | undefined;
  toolResult?: unknown;
  toolError?: string | undefined;
  toolDurationMs?: number | undefined;
  /** Chess context for meaningful display */
  currentFen?: string | undefined;
  currentLine?: string[] | undefined;
  branchPurpose?: string | undefined;
}

/**
 * Result of agentic exploration
 */
export interface AgenticExplorerResult {
  /** Explored variations in ExploredLine format */
  variations: ExploredLine[];
  /** Total tool calls used */
  toolCalls: number;
  /** Total tokens used */
  tokensUsed: number;
  /** Summary from LLM */
  summary?: string;
  /** Cache statistics */
  cacheStats?: {
    hits: number;
    misses: number;
    hitRate: number;
  };
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<AgenticExplorerConfig> = {
  maxToolCalls: 40,
  softToolCap: 25,
  maxDepth: 50,
  maxBranches: 5,
  targetRating: 1500,
};

/**
 * Agentic Variation Explorer
 *
 * Uses an iterative tool-calling loop where the LLM decides how to explore
 * a chess position. The LLM has complete control over:
 * - Which moves to explore
 * - When to branch into alternatives
 * - Where to add comments and annotations
 * - When to stop exploring
 */
/**
 * Cache key for engine evaluations
 * Uses FEN (normalized to position only) and depth
 */
function getEvalCacheKey(fen: string, depth: number): string {
  // Normalize FEN - remove move counters
  const fenParts = fen.split(' ');
  const normalizedFen = fenParts.slice(0, 4).join(' ');
  return `eval:${normalizedFen}:d${depth}`;
}

/**
 * Minimum depth to cache evaluations
 * Shallow evaluations (< 14) aren't worth caching
 */
const MIN_CACHE_DEPTH = 14;

/**
 * Agentic Variation Explorer
 *
 * Uses an iterative tool-calling loop where the LLM decides how to explore
 * a chess position. The LLM has complete control over:
 * - Which moves to explore
 * - When to branch into alternatives
 * - Where to add comments and annotations
 * - When to stop exploring
 */
export class AgenticVariationExplorer {
  private readonly config: Required<AgenticExplorerConfig>;
  private readonly stoppingConfig: StoppingConfig;
  private readonly toolExecutor: ToolExecutor;
  /** Cache for deep engine evaluations */
  private readonly evalCache: ResponseCache<EvaluatePositionResult>;
  /** Cache stats */
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(
    private readonly llmClient: OpenAIClient,
    private readonly llmConfig: LLMConfig,
    services: AgenticServices,
    config?: AgenticExplorerConfig,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stoppingConfig = {
      ...DEFAULT_STOPPING_CONFIG,
      maxToolCalls: this.config.maxToolCalls,
      softToolCap: this.config.softToolCap,
      maxDepth: this.config.maxDepth,
    };
    this.toolExecutor = new ToolExecutor(services, this.config.targetRating);
    // Initialize evaluation cache with 1 hour TTL and 500 entries
    this.evalCache = new ResponseCache({
      maxSize: 500,
      ttlMs: 60 * 60 * 1000, // 1 hour
    });
  }

  /**
   * Explore variations from a position
   *
   * @param startingFen - Position to explore
   * @param targetRating - Target rating for explanations
   * @param playedMove - The move that was actually played (optional, for context)
   * @param onProgress - Progress callback
   * @returns Explored variations
   */
  async explore(
    startingFen: string,
    targetRating: number,
    playedMove?: string,
    onProgress?: (progress: AgenticExplorerProgress) => void,
  ): Promise<AgenticExplorerResult> {
    const state = new ExplorationState(startingFen);
    let toolCallCount = 0;
    let tokensUsed = 0;
    let finished = false;
    let summary: string | undefined;

    // Track evaluations for swing detection
    let previousEval: number | undefined;
    let currentEval: number | undefined;

    // Build initial context
    const systemPrompt = this.buildSystemPrompt(targetRating);
    const initialBoard = formatBoardForPrompt(startingFen);
    const initialContext = this.buildInitialContext(startingFen, initialBoard, playedMove);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: initialContext },
    ];

    // Agentic exploration loop
    while (!finished && toolCallCount < this.config.maxToolCalls) {
      // Report progress
      onProgress?.({
        phase: state.getCurrentDepth() === 0 ? 'starting' : 'exploring',
        toolCalls: toolCallCount,
        currentDepth: state.getCurrentDepth(),
        branchCount: state.getBranchCount(),
      });

      // Add budget guidance if approaching limits
      const guidance = getBudgetGuidance(toolCallCount, this.stoppingConfig);
      if (guidance) {
        messages.push({
          role: 'system',
          content: `[${guidance}]`,
        });
      }

      // Force finish_exploration on last iteration
      const toolChoice: ToolChoice =
        toolCallCount >= this.config.maxToolCalls - 1
          ? { type: 'function', function: { name: 'finish_exploration' } }
          : 'auto';

      // Call LLM with tools
      const response = await this.llmClient.chat({
        messages,
        tools: EXPLORATION_TOOLS,
        toolChoice,
        temperature: this.llmConfig.temperature,
      });

      tokensUsed += response.usage?.totalTokens ?? 0;

      // If no tool calls, we're done
      if (!response.toolCalls || response.toolCalls.length === 0) {
        finished = true;
        break;
      }

      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: response.content || '',
        toolCalls: response.toolCalls,
      });

      // Process each tool call
      for (const toolCall of response.toolCalls) {
        toolCallCount++;

        // Parse tool arguments for logging
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
        } catch {
          // Ignore parse errors
        }

        // Capture timing
        const toolStartTime = Date.now();

        // Execute the tool
        const result = await this.executeExplorationTool(
          toolCall,
          state,
          toolCallCount,
          previousEval,
          currentEval,
        );

        const toolDurationMs = Date.now() - toolStartTime;

        // Track eval for swing detection
        if (typeof result === 'object' && result !== null) {
          const resultObj = result as Record<string, unknown>;
          if ('evaluation' in resultObj && typeof resultObj.evaluation === 'number') {
            previousEval = currentEval;
            currentEval = resultObj.evaluation;
          }
        }

        // Add tool result message
        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          toolCallId: toolCall.id,
        });

        // Determine phase and branch purpose
        const toolName = toolCall.function.name;
        const phase =
          toolName === 'start_branch'
            ? 'branching'
            : toolName === 'finish_exploration'
              ? 'finishing'
              : 'exploring';

        // Get branch purpose if this is a branching call
        const branchPurpose =
          toolName === 'start_branch' ? (toolArgs.purpose as string | undefined) : undefined;

        // Check for tool error
        const toolError =
          typeof result === 'object' && result !== null && 'error' in result
            ? String((result as Record<string, unknown>).error)
            : undefined;

        // Report rich progress with tool details and chess context
        onProgress?.({
          phase,
          toolCalls: toolCallCount,
          currentDepth: state.getCurrentDepth(),
          branchCount: state.getBranchCount(),
          lastTool: toolName,
          toolArgs,
          toolResult: result,
          toolError,
          toolDurationMs,
          currentFen: state.getCurrentFen(),
          currentLine: state.getMoveHistory(),
          branchPurpose,
        });

        // Check for exploration completion
        if (toolName === 'finish_exploration') {
          summary = toolArgs.summary as string | undefined;
          finished = true;
          break;
        }
      }
    }

    const result: AgenticExplorerResult = {
      variations: state.toExploredLines(),
      toolCalls: toolCallCount,
      tokensUsed,
    };

    if (summary) {
      result.summary = summary;
    }

    // Add cache stats if there were any cache operations
    if (this.cacheHits > 0 || this.cacheMisses > 0) {
      const total = this.cacheHits + this.cacheMisses;
      result.cacheStats = {
        hits: this.cacheHits,
        misses: this.cacheMisses,
        hitRate: total > 0 ? this.cacheHits / total : 0,
      };
    }

    return result;
  }

  /**
   * Execute an exploration tool
   *
   * Handles exploration-specific tools directly, delegates others to ToolExecutor.
   */
  private async executeExplorationTool(
    toolCall: ToolCall,
    state: ExplorationState,
    toolCallsUsed: number,
    previousEval?: number,
    currentEval?: number,
  ): Promise<unknown> {
    const name = toolCall.function.name;
    let args: Record<string, unknown>;

    try {
      args = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
    } catch {
      args = {};
    }

    switch (name) {
      // === Board visualization ===
      case 'get_board':
        return {
          board: renderBoard(state.getCurrentFen()),
          fen: state.getCurrentFen(),
          moveHistory: state.getMoveHistory(),
        };

      // === Move navigation ===
      case 'push_move': {
        const moveArg = args.move as string;
        if (!moveArg) {
          return { success: false, error: 'No move provided' };
        }

        try {
          const pos = new ChessPosition(state.getCurrentFen());

          // Handle UCI format
          let san = moveArg;
          if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(moveArg)) {
            san = pos.uciToSan(moveArg);
          }

          const result = pos.move(san);

          const exploredMove: ExploredMove = {
            san: result.san,
            fenAfter: result.fenAfter,
          };
          state.pushMove(exploredMove);

          const newPos = new ChessPosition(result.fenAfter);
          return {
            success: true,
            san: result.san,
            fenAfter: result.fenAfter,
            board: renderBoard(result.fenAfter),
            legalMoves: newPos.getLegalMoves().slice(0, 10),
            isCheck: newPos.isCheck(),
            isCheckmate: newPos.isCheckmate(),
            depth: state.getCurrentDepth(),
          };
        } catch (e) {
          return {
            success: false,
            error: `Illegal move: ${moveArg}`,
            legalMoves: new ChessPosition(state.getCurrentFen()).getLegalMoves().slice(0, 10),
          };
        }
      }

      case 'pop_move': {
        const popped = state.popMove();
        if (!popped) {
          return { success: false, error: 'No moves to pop' };
        }
        return {
          success: true,
          poppedMove: popped.san,
          currentFen: state.getCurrentFen(),
          board: renderBoard(state.getCurrentFen()),
          depth: state.getCurrentDepth(),
        };
      }

      // === Branching ===
      case 'start_branch': {
        if (state.getBranchCount() >= this.config.maxBranches) {
          return {
            success: false,
            error: `Maximum branches reached (${this.config.maxBranches})`,
          };
        }

        const purpose = (args.purpose as LinePurpose) || 'thematic';
        state.startBranch(purpose);

        return {
          success: true,
          branchPurpose: purpose,
          branchCount: state.getBranchCount(),
          nestingDepth: state.getNestingDepth(),
        };
      }

      case 'end_branch': {
        const ended = state.endBranch();
        if (!ended) {
          return { success: false, error: 'Not in a sub-variation' };
        }
        return {
          success: true,
          returnedToMainLine: state.getNestingDepth() === 0,
          currentFen: state.getCurrentFen(),
          board: renderBoard(state.getCurrentFen()),
        };
      }

      // === Annotation ===
      case 'add_comment': {
        const comment = args.comment as string;
        if (!comment) {
          return { success: false, error: 'No comment provided' };
        }
        const added = state.addComment(comment);
        if (!added) {
          return { success: false, error: 'No move to annotate (play a move first)' };
        }
        return { success: true, comment };
      }

      case 'add_nag': {
        const nag = args.nag as string;
        if (!nag) {
          return { success: false, error: 'No NAG provided' };
        }
        const added = state.addNag(nag);
        if (!added) {
          return { success: false, error: 'No move to annotate (play a move first)' };
        }
        return { success: true, nag };
      }

      // === NAG suggestion tools ===
      case 'suggest_nag': {
        // Get the move history to find the last move
        const history = state.getMoveHistory();
        if (history.length === 0) {
          return { success: false, error: 'No move to analyze (play a move first)' };
        }

        const lastMove = history[history.length - 1]!;
        const currentFen = state.getCurrentFen();

        // We need the FEN before the last move to evaluate both positions
        // Pop the move, evaluate, push it back
        const popped = state.popMove();
        if (!popped) {
          return { success: false, error: 'Cannot analyze move' };
        }

        const fenBefore = state.getCurrentFen();

        try {
          // Evaluate position before the move
          const evalBefore = await this.toolExecutor.execute({
            id: 'suggest_nag_before',
            type: 'function',
            function: {
              name: 'evaluate_position',
              arguments: JSON.stringify({ fen: fenBefore, depth: 16, multipv: 2 }),
            },
          });

          // Restore the move
          state.pushMove(popped);

          // Evaluate position after the move
          const evalAfter = await this.toolExecutor.execute({
            id: 'suggest_nag_after',
            type: 'function',
            function: {
              name: 'evaluate_position',
              arguments: JSON.stringify({ fen: currentFen, depth: 16 }),
            },
          });

          // Calculate NAG based on eval difference
          return this.calculateMoveNag(
            evalBefore.result as Record<string, unknown>,
            evalAfter.result as Record<string, unknown>,
            lastMove,
            args.context as string | undefined,
          );
        } catch (e) {
          // Restore move if evaluation failed
          state.pushMove(popped);
          return { success: false, error: 'Engine evaluation failed' };
        }
      }

      case 'get_eval_nag': {
        const currentFen = state.getCurrentFen();

        // Evaluate current position
        const evalResult = await this.toolExecutor.execute({
          id: 'get_eval_nag',
          type: 'function',
          function: {
            name: 'evaluate_position',
            arguments: JSON.stringify({ fen: currentFen, depth: 16 }),
          },
        });

        const result = evalResult.result as Record<string, unknown>;
        if (!result || evalResult.error) {
          return { success: false, error: 'Engine evaluation failed' };
        }

        // Determine evaluation NAG
        const evalNag = this.calculateEvalNag(
          result.evaluation as number,
          result.isMate as boolean,
          result.mateIn as number | undefined,
          currentFen,
        );

        return {
          success: true,
          nag: evalNag.nag,
          description: evalNag.description,
          evaluation: result.evaluation,
        };
      }

      // === Stopping assessment ===
      case 'assess_continuation': {
        const assessment = assessContinuation(
          state.getCurrentFen(),
          previousEval,
          currentEval,
          state.getCurrentDepth(),
          toolCallsUsed,
          this.stoppingConfig,
        );
        return assessment;
      }

      // === Finish exploration ===
      case 'finish_exploration': {
        return { finished: true, summary: args.summary };
      }

      // === Delegate to ToolExecutor for analysis tools ===
      case 'evaluate_position': {
        const currentFen = state.getCurrentFen();
        const depth = (args.depth as number) ?? 16;
        const numLines = args.numLines as number | undefined;

        // Check cache for deep evaluations
        if (depth >= MIN_CACHE_DEPTH) {
          const cacheKey = getEvalCacheKey(currentFen, depth);
          const cached = this.evalCache.get(cacheKey);
          if (cached) {
            this.cacheHits++;
            return { result: cached, cached: true };
          }
          this.cacheMisses++;
        }

        // Execute the evaluation
        const evalArgs = {
          fen: currentFen,
          depth,
          multipv: numLines,
        };
        const result = await this.toolExecutor.execute({
          ...toolCall,
          function: {
            ...toolCall.function,
            arguments: JSON.stringify(evalArgs),
          },
        });

        // Cache the result if deep enough
        if (depth >= MIN_CACHE_DEPTH && result.result && !result.error) {
          const cacheKey = getEvalCacheKey(currentFen, depth);
          this.evalCache.set(cacheKey, result.result as EvaluatePositionResult);
        }

        return result;
      }

      case 'predict_human_moves': {
        const predictArgs = {
          fen: state.getCurrentFen(),
          rating: args.rating ?? this.config.targetRating,
        };
        return this.toolExecutor.execute({
          ...toolCall,
          function: {
            ...toolCall.function,
            arguments: JSON.stringify(predictArgs),
          },
        });
      }

      case 'lookup_opening': {
        const lookupArgs = { fen: state.getCurrentFen() };
        return this.toolExecutor.execute({
          ...toolCall,
          function: {
            ...toolCall.function,
            arguments: JSON.stringify(lookupArgs),
          },
        });
      }

      case 'find_reference_games': {
        const gamesArgs = {
          fen: state.getCurrentFen(),
          limit: args.limit,
        };
        return this.toolExecutor.execute({
          ...toolCall,
          function: {
            ...toolCall.function,
            arguments: JSON.stringify(gamesArgs),
          },
        });
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  /**
   * Build the system prompt for exploration
   */
  private buildSystemPrompt(targetRating: number): string {
    return `You are an expert chess analyst exploring variations to create instructive annotations.

TARGET AUDIENCE: ${targetRating} rated players

## YOUR TOOLS

### Board & Navigation
- get_board: See the current position visually
- push_move: Play a move forward (SAN format: "Nf3", "e4", "O-O")
- pop_move: Go back one move

### Branching
- start_branch: Create a sub-variation for alternatives
- end_branch: Return to parent line

### Annotation
- add_comment: Add annotation to last move (2-6 words: "the point", "threatening mate")
- add_nag: Add quality symbol manually ($1=!, $2=?, $3=!!, $4=??, $5=!?, $6=?!)
- suggest_nag: Get engine-based NAG suggestion for last move (use this to decide if a move deserves !, ?, etc.)
- get_eval_nag: Get position evaluation NAG for end of line ($14-$19 for advantage)

### Analysis
- evaluate_position: Get engine assessment + best line
- predict_human_moves: See what humans would play at ${targetRating} rating

### Control
- assess_continuation: Check if position is worth exploring further
- finish_exploration: Complete exploration

## EXPLORATION GUIDELINES

1. **Start by understanding the position**
   - Get the board visualization
   - Evaluate the position to understand what's happening

2. **Explore forcing sequences thoroughly**
   - Follow checks, captures, and threats
   - Don't stop in the middle of tactical sequences

3. **Add comments at KEY moments only**
   - Opening comment: WHY this variation ("the engine's choice", "a human error")
   - Critical moves: "the point", "with tempo", "threatening Qxh7"
   - Ending: OUTCOME ("and Black wins material", "with equality")

4. **Use NAGs appropriately**
   - Use suggest_nag after important moves to get engine-based quality assessment
   - ! ($1) = good move, ? ($2) = mistake, !! ($3) = brilliant, ?? ($4) = blunder
   - !? ($5) = interesting - use for creative/tricky moves that aren't objectively best
   - ?! ($6) = dubious - slight inaccuracy but might have practical merit
   - Use get_eval_nag at end of lines to mark the resulting position

5. **Use branches for important alternatives**
   - Human-likely moves that fail
   - Alternative winning methods
   - Maximum ${this.config.maxBranches} branches

6. **Use assess_continuation when unsure**
   - It will tell you if the position is worth exploring further

## STOPPING CRITERIA

**CONTINUE** when:
- Tactical tension exists (hanging pieces, checks, captures)
- Large eval swing just occurred
- The "point" hasn't been shown yet
- Position is still unresolved

**STOP** when:
- Position is quiet and resolved
- Point has been demonstrated
- Material outcome is clear
- assess_continuation suggests stopping

## ANNOTATION STYLE

- Max 2 sentences per comment
- No numeric evaluations (use "winning", "slight edge", "equal")
- Focus on WHY, not just outcomes
- Keep comments SHORT: 2-6 words preferred

## CRITICAL: AVOID THESE COMMENT MISTAKES

1. **NEVER repeat the move notation** - the move is already shown
   - BAD: "Nxg7! wins the queen"
   - GOOD: "wins the queen"

2. **NEVER start comments with "this" or "here"**
   - BAD: "this threatens mate"
   - GOOD: "threatening mate"

3. **Keep comments about THE CURRENT MOVE only**
   - Comments should explain the move they're attached to
   - Don't discuss future or past moves in the comment

4. **Use lowercase, no punctuation at end**
   - BAD: "The point!"
   - GOOD: "the point"`;
  }

  /**
   * Calculate move quality NAG based on evaluation comparison
   *
   * Thresholds (rating-adaptive, using 1500 as baseline):
   * - Brilliant ($3 !!): Move finds winning line others miss, often sacrifice
   * - Good ($1 !): Best move or within 10cp of best
   * - Interesting ($5 !?): Not best but creative/tricky, might work practically
   * - Dubious ($6 ?!): Slightly inaccurate (30-80cp loss)
   * - Mistake ($2 ?): Clear error (80-200cp loss)
   * - Blunder ($4 ??): Serious error (200+cp loss)
   */
  private calculateMoveNag(
    evalBefore: Record<string, unknown>,
    evalAfter: Record<string, unknown>,
    move: string,
    context?: string,
  ): { success: boolean; nag?: string; reason: string; cpLoss?: number } {
    if (!evalBefore || !evalAfter) {
      return { success: false, reason: 'Missing evaluation data' };
    }

    const cpBefore = evalBefore.evaluation as number;
    const cpAfter = evalAfter.evaluation as number;
    const bestMove = evalBefore.bestMove as string;
    const alternatives = evalBefore.alternatives as Array<{ evaluation: number }> | undefined;

    // Note: After a move, eval sign flips (opponent's perspective)
    // So we negate cpAfter to compare from the same perspective
    const cpAfterNormalized = -cpAfter;

    // Calculate centipawn loss
    const cpLoss = cpBefore - cpAfterNormalized;

    // Check if this was the best move
    const isBestMove = move === bestMove;

    // Check if this is a unique winning move (brilliant candidate)
    const secondBestEval = alternatives?.[0]?.evaluation ?? cpBefore;
    const uniquelyBest = isBestMove && cpBefore - secondBestEval > 100;

    // Check for sacrifices or creative moves based on context
    const isSacrifice =
      context?.toLowerCase().includes('sacrific') || move.includes('x') || context?.includes('!');

    // Determine NAG
    if (isBestMove) {
      if (uniquelyBest || (isSacrifice && cpBefore > 100)) {
        return { success: true, nag: '$3', reason: 'brilliant - unique winning move', cpLoss: 0 };
      }
      return { success: true, nag: '$1', reason: 'best move', cpLoss: 0 };
    }

    if (cpLoss <= 10) {
      return { success: true, nag: '$1', reason: 'excellent - within 10cp of best', cpLoss };
    }

    if (cpLoss <= 30) {
      // Good but not best - might be interesting if it has practical merit
      if (context || isSacrifice) {
        return {
          success: true,
          nag: '$5',
          reason: 'interesting alternative',
          cpLoss,
        };
      }
      // No NAG needed - return without nag property
      return { success: true, reason: 'acceptable - no NAG needed', cpLoss };
    }

    if (cpLoss <= 80) {
      // Dubious but might have practical value
      if (context?.toLowerCase().includes('practical') || context?.toLowerCase().includes('trap')) {
        return { success: true, nag: '$5', reason: 'interesting despite inaccuracy', cpLoss };
      }
      return { success: true, nag: '$6', reason: 'dubious - 30-80cp loss', cpLoss };
    }

    if (cpLoss <= 200) {
      return { success: true, nag: '$2', reason: 'mistake - 80-200cp loss', cpLoss };
    }

    return { success: true, nag: '$4', reason: 'blunder - 200+cp loss', cpLoss };
  }

  /**
   * Calculate evaluation NAG for end of line
   *
   * $10 = drawish
   * $13 = unclear
   * $14 = slight edge White
   * $15 = slight edge Black
   * $16 = moderate advantage White
   * $17 = moderate advantage Black
   * $18 = decisive advantage White
   * $19 = decisive advantage Black
   */
  private calculateEvalNag(
    cp: number,
    isMate: boolean,
    mateIn: number | undefined,
    fen: string,
  ): { nag: string | undefined; description: string } {
    // Determine whose perspective (side to move)
    const pos = new ChessPosition(fen);
    const sideToMove = pos.turn();

    // Mate situations
    if (isMate && mateIn !== undefined) {
      if (mateIn > 0) {
        // Side to move has mate
        const winner = sideToMove === 'w' ? 'White' : 'Black';
        return {
          nag: winner === 'White' ? '$18' : '$19',
          description: `${winner} has forced mate in ${Math.abs(mateIn)}`,
        };
      } else {
        // Side to move is getting mated
        const winner = sideToMove === 'w' ? 'Black' : 'White';
        return {
          nag: winner === 'White' ? '$18' : '$19',
          description: `${winner} has forced mate in ${Math.abs(mateIn)}`,
        };
      }
    }

    // Convert cp to absolute advantage from White's perspective
    // Engine returns eval from side-to-move's perspective
    const whiteAdvantage = sideToMove === 'w' ? cp : -cp;
    const absAdvantage = Math.abs(whiteAdvantage);
    const advantageSide = whiteAdvantage > 0 ? 'White' : 'Black';

    if (absAdvantage < 15) {
      return { nag: '$10', description: 'equal position' };
    }

    if (absAdvantage < 50) {
      return {
        nag: advantageSide === 'White' ? '$14' : '$15',
        description: `slight edge ${advantageSide}`,
      };
    }

    if (absAdvantage < 150) {
      return {
        nag: advantageSide === 'White' ? '$16' : '$17',
        description: `${advantageSide} is better`,
      };
    }

    return {
      nag: advantageSide === 'White' ? '$18' : '$19',
      description: `${advantageSide} is winning`,
    };
  }

  /**
   * Build initial context for exploration
   */
  private buildInitialContext(fen: string, board: string, playedMove?: string): string {
    const parts = ['STARTING POSITION:', board, '', `FEN: ${fen}`];

    if (playedMove) {
      parts.push(`PLAYED MOVE: ${playedMove}`);
      parts.push('');
      parts.push('Explore why this move was played and what the alternatives were.');
      parts.push('Show the consequences of good and bad moves.');
    } else {
      parts.push('');
      parts.push('Explore the key variations from this position.');
      parts.push('Show the best play and common human mistakes.');
    }

    parts.push('');
    parts.push('Start by getting the board and evaluating the position.');

    return parts.join('\n');
  }
}

/**
 * Create an agentic variation explorer
 */
export function createAgenticExplorer(
  llmClient: OpenAIClient,
  llmConfig: LLMConfig,
  services: AgenticServices,
  config?: AgenticExplorerConfig,
): AgenticVariationExplorer {
  return new AgenticVariationExplorer(llmClient, llmConfig, services, config);
}
