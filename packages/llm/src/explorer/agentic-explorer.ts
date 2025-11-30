/**
 * Agentic Variation Explorer (Tree-Based)
 *
 * A fully agentic system where the LLM navigates a variation tree:
 * - Each node = one move with metadata (comment, NAGs, engine cache)
 * - One child marked "principal" = main line
 * - LLM navigates via add_move, add_alternative, go_to
 * - Tree structure automatically produces correct PGN
 *
 * No more start_branch/end_branch - the tree handles variation nesting.
 */

import { ChessPosition, renderBoard, formatBoardForPrompt } from '@chessbeast/pgn';
import type { MoveInfo } from '@chessbeast/pgn';

import { ResponseCache } from '../cache/response-cache.js';
import type { OpenAIClient } from '../client/openai-client.js';
import type { ChatMessage, ToolChoice } from '../client/types.js';
import type { LLMConfig } from '../config/llm-config.js';
import { ToolExecutor } from '../tools/executor.js';
import type { AgenticServices, ToolCall, EvaluatePositionResult } from '../tools/types.js';

import { EXPLORATION_TOOLS } from './exploration-tools.js';
import {
  assessContinuation,
  getBudgetGuidance,
  type StoppingConfig,
  DEFAULT_STOPPING_CONFIG,
} from './stopping-heuristics.js';
import type { ExploredLine, LinePurpose, LineSource } from './variation-explorer.js';
import { VariationTree } from './variation-tree.js';

/**
 * Validate and clean up LLM comment
 */
function validateAndCleanComment(
  comment: string,
  lastMoveSan?: string,
): { cleaned: string; rejected: boolean; reason?: string } {
  // Reject meta-commentary patterns (before any cleanup)
  const bannedPatterns = [
    /from\s+(our|my|the|white's|black's)\s+(side|perspective)/i,
    /this\s+move\s+(is|was)/i,
    /the\s+(played|actual)\s+move/i,
    /from\s+(our|my)\s+point\s+of\s+view/i,
  ];

  for (const pattern of bannedPatterns) {
    if (pattern.test(comment)) {
      return {
        cleaned: '',
        rejected: true,
        reason:
          'Comment should describe the position/move, not meta-commentary. Use 2-8 words like "threatens mate" or "wins material".',
      };
    }
  }

  // Reject if too long (50 chars ≈ 8 words)
  if (comment.length > 50) {
    return {
      cleaned: '',
      rejected: true,
      reason: 'Comment too long. Maximum 8 words (50 chars). Be concise.',
    };
  }

  let cleaned = comment;

  // Silent cleanup: Remove move notation at start
  if (lastMoveSan) {
    const escaped = lastMoveSan.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const movePattern = new RegExp(`^${escaped}[!?]*\\s+`, 'i');
    cleaned = cleaned.replace(movePattern, '');
  }

  // Silent cleanup: Remove leading "this " or "here "
  cleaned = cleaned.replace(/^(this|here)\s+/i, '');

  // Silent cleanup: Ensure lowercase start
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  }

  // Silent cleanup: Remove ending punctuation
  cleaned = cleaned.replace(/[.!]+$/, '');

  cleaned = cleaned.trim();

  if (!cleaned) {
    return {
      cleaned: '',
      rejected: true,
      reason: 'Comment empty after cleanup. Provide meaningful annotation.',
    };
  }

  return { cleaned, rejected: false };
}

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
  /** Target rating for human-move predictions */
  targetRating?: number;
  /** Callback for warning messages */
  warnCallback?: (message: string) => void;
}

/**
 * Progress callback information
 */
export interface AgenticExplorerProgress {
  phase: 'starting' | 'exploring' | 'navigating' | 'finishing';
  toolCalls: number;
  nodeCount: number;
  lastTool?: string | undefined;
  toolArgs?: Record<string, unknown> | undefined;
  toolResult?: unknown;
  toolError?: string | undefined;
  toolDurationMs?: number | undefined;
  currentFen?: string | undefined;
  currentSan?: string | undefined;
}

/**
 * Result of agentic exploration
 */
export interface AgenticExplorerResult {
  /** MoveInfo array for PGN rendering */
  moves: MoveInfo[];
  /** Explored variations in legacy format (for compatibility) */
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
  targetRating: 1500,
  warnCallback: () => {},
};

/**
 * Cache key for engine evaluations
 */
function getEvalCacheKey(fen: string, depth: number): string {
  const fenParts = fen.split(' ');
  const normalizedFen = fenParts.slice(0, 4).join(' ');
  return `eval:${normalizedFen}:d${depth}`;
}

const MIN_CACHE_DEPTH = 14;

/**
 * Agentic Variation Explorer (Tree-Based)
 */
export class AgenticVariationExplorer {
  private readonly config: Required<AgenticExplorerConfig>;
  private readonly stoppingConfig: StoppingConfig;
  private readonly toolExecutor: ToolExecutor;
  private readonly evalCache: ResponseCache<EvaluatePositionResult>;
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
    this.evalCache = new ResponseCache({
      maxSize: 500,
      ttlMs: 60 * 60 * 1000,
    });
  }

  /**
   * Explore variations from a position
   */
  async explore(
    startingFen: string,
    targetRating: number,
    playedMove?: string,
    moveClassification?:
      | 'book'
      | 'excellent'
      | 'good'
      | 'inaccuracy'
      | 'mistake'
      | 'blunder'
      | 'brilliant'
      | 'forced',
    onProgress?: (progress: AgenticExplorerProgress) => void,
    gameMoves?: Array<{ san: string; fenAfter: string }>,
  ): Promise<AgenticExplorerResult> {
    // Initialize tree with position BEFORE the played move
    const tree = new VariationTree(startingFen);

    // If we have game moves, initialize the principal path
    if (gameMoves && gameMoves.length > 0) {
      tree.initializeFromMoves(gameMoves);
    }

    // CRITICAL: Add the played move as a child so LLM starts AT it (not at root)
    // This allows add_alternative() to work immediately (creates sibling)
    if (playedMove) {
      tree.addMove(playedMove);
    }

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
    const initialContext = this.buildInitialContext(
      startingFen,
      initialBoard,
      playedMove,
      moveClassification,
    );

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: initialContext },
    ];

    // Agentic exploration loop
    while (!finished && toolCallCount < this.config.maxToolCalls) {
      onProgress?.({
        phase: toolCallCount === 0 ? 'starting' : 'exploring',
        toolCalls: toolCallCount,
        nodeCount: tree.getAllNodes().length,
        currentFen: tree.getCurrentNode().fen,
        currentSan: tree.getCurrentNode().san,
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

      const response = await this.llmClient.chat({
        messages,
        tools: EXPLORATION_TOOLS,
        toolChoice,
        temperature: this.llmConfig.temperature,
      });

      tokensUsed += response.usage?.totalTokens ?? 0;

      if (!response.toolCalls || response.toolCalls.length === 0) {
        finished = true;
        break;
      }

      messages.push({
        role: 'assistant',
        content: response.content || '',
        toolCalls: response.toolCalls,
      });

      for (const toolCall of response.toolCalls) {
        toolCallCount++;

        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
        } catch (e) {
          this.config.warnCallback?.(
            `Failed to parse tool arguments for ${toolCall.function.name}: ${toolCall.function.arguments}`,
          );
        }

        const toolStartTime = Date.now();

        const result = await this.executeTreeTool(
          toolCall,
          tree,
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

        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          toolCallId: toolCall.id,
        });

        const toolName = toolCall.function.name;
        const phase =
          toolName === 'go_to' || toolName === 'go_to_parent'
            ? 'navigating'
            : toolName === 'finish_exploration'
              ? 'finishing'
              : 'exploring';

        const toolError =
          typeof result === 'object' && result !== null && 'error' in result
            ? String((result as Record<string, unknown>).error)
            : undefined;

        onProgress?.({
          phase,
          toolCalls: toolCallCount,
          nodeCount: tree.getAllNodes().length,
          lastTool: toolName,
          toolArgs,
          toolResult: result,
          toolError,
          toolDurationMs,
          currentFen: tree.getCurrentNode().fen,
          currentSan: tree.getCurrentNode().san,
        });

        if (toolName === 'finish_exploration') {
          summary = toolArgs.summary as string | undefined;
          finished = true;
          break;
        }
      }
    }

    // Convert tree to MoveInfo for PGN
    const moves = tree.toMoveInfo();

    // Convert MoveInfo[] to ExploredLine[] for backward compatibility
    const variations = convertMoveInfoToExploredLines(moves);

    const result: AgenticExplorerResult = {
      moves,
      variations,
      toolCalls: toolCallCount,
      tokensUsed,
    };

    if (summary) {
      result.summary = summary;
    }

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
   * Execute a tree-based exploration tool
   */
  private async executeTreeTool(
    toolCall: ToolCall,
    tree: VariationTree,
    toolCallsUsed: number,
    previousEval?: number,
    currentEval?: number,
  ): Promise<unknown> {
    const name = toolCall.function.name;
    let args: Record<string, unknown>;

    try {
      args = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
    } catch (e) {
      this.config.warnCallback?.(
        `Failed to parse tool arguments for ${name}: ${toolCall.function.arguments}`,
      );
      args = {};
    }

    switch (name) {
      // === Navigation ===
      case 'get_position': {
        return {
          success: true,
          ...tree.getCurrentNodeInfo(),
          board: renderBoard(tree.getCurrentNode().fen),
        };
      }

      case 'add_move': {
        const san = args.san as string;
        if (!san) {
          return { success: false, error: 'No move provided' };
        }

        const result = tree.addMove(san);
        if (!result.success) {
          const pos = new ChessPosition(tree.getCurrentNode().fen);
          return {
            success: false,
            error: result.error,
            legalMoves: pos.getLegalMoves().slice(0, 10),
          };
        }

        const newNode = tree.getCurrentNode();
        const pos = new ChessPosition(newNode.fen);
        return {
          success: true,
          message: result.message,
          fen: newNode.fen,
          san: newNode.san,
          board: renderBoard(newNode.fen),
          legalMoves: pos.getLegalMoves().slice(0, 10),
          isCheck: pos.isCheck(),
          isCheckmate: pos.isCheckmate(),
        };
      }

      case 'add_alternative': {
        const san = args.san as string;
        if (!san) {
          return { success: false, error: 'No move provided' };
        }

        const result = tree.addAlternative(san);
        if (!result.success) {
          return { success: false, error: result.error };
        }

        return {
          success: true,
          message: result.message,
          alternativeFen: result.node?.fen,
          alternativeSan: result.node?.san,
          currentFen: tree.getCurrentNode().fen,
          note: 'You remain at your current position. Use go_to to navigate to the alternative.',
        };
      }

      case 'go_to': {
        const fen = args.fen as string;
        if (!fen) {
          return { success: false, error: 'No FEN provided' };
        }

        const result = tree.goTo(fen);
        if (!result.success) {
          return { success: false, error: result.error };
        }

        const node = tree.getCurrentNode();
        return {
          success: true,
          message: result.message,
          ...tree.getCurrentNodeInfo(),
          board: renderBoard(node.fen),
        };
      }

      case 'go_to_parent': {
        const result = tree.goToParent();
        if (!result.success) {
          return { success: false, error: result.error };
        }

        const node = tree.getCurrentNode();
        return {
          success: true,
          message: result.message,
          ...tree.getCurrentNodeInfo(),
          board: renderBoard(node.fen),
        };
      }

      case 'get_tree': {
        return {
          success: true,
          tree: tree.getAsciiTree(),
          nodeCount: tree.getAllNodes().length,
        };
      }

      // === Annotation ===
      case 'annotate': {
        const comment = args.comment as string | undefined;
        const nags = args.nags as string[] | undefined;

        if (comment) {
          const { cleaned, rejected, reason } = validateAndCleanComment(
            comment,
            tree.getCurrentNode().san,
          );
          if (rejected) {
            return { success: false, error: reason };
          }
          tree.setComment(cleaned);
        }

        if (nags && nags.length > 0) {
          tree.setNags(nags);
        }

        return {
          success: true,
          comment: tree.getCurrentNode().comment,
          nags: tree.getCurrentNode().nags,
        };
      }

      case 'add_nag': {
        const nag = args.nag as string;
        if (!nag) {
          return { success: false, error: 'No NAG provided' };
        }
        tree.addNag(nag);
        return { success: true, nags: tree.getCurrentNode().nags };
      }

      case 'set_principal': {
        const san = args.san as string;
        if (!san) {
          return { success: false, error: 'No move provided' };
        }
        const result = tree.setPrincipal(san);
        return result;
      }

      // === Work Queue ===
      case 'mark_interesting': {
        const moves = args.moves as string[];
        if (!moves || moves.length === 0) {
          return { success: false, error: 'No moves provided' };
        }
        tree.markInteresting(moves);
        return {
          success: true,
          interestingMoves: tree.getInteresting(),
        };
      }

      case 'get_interesting': {
        return {
          success: true,
          interestingMoves: tree.getInteresting(),
          fen: tree.getCurrentNode().fen,
        };
      }

      case 'clear_interesting': {
        const move = args.move as string;
        if (!move) {
          return { success: false, error: 'No move provided' };
        }
        tree.clearInteresting(move);
        return {
          success: true,
          remainingInteresting: tree.getInteresting(),
        };
      }

      // === Analysis ===
      case 'evaluate_position': {
        const currentFen = tree.getCurrentNode().fen;
        const depth = (args.depth as number) ?? 20;
        const numLines = args.numLines as number | undefined;

        // Check cache
        if (depth >= MIN_CACHE_DEPTH) {
          const cacheKey = getEvalCacheKey(currentFen, depth);
          const cached = this.evalCache.get(cacheKey);
          if (cached) {
            this.cacheHits++;
            // Also cache on tree node
            tree.setEngineEval({
              score: cached.evaluation ?? 0,
              depth,
              bestLine: cached.principalVariation ?? [],
              timestamp: Date.now(),
            });
            return { result: cached, cached: true };
          }
          this.cacheMisses++;
        }

        const evalArgs = { fen: currentFen, depth, multipv: numLines };
        const result = await this.toolExecutor.execute({
          ...toolCall,
          function: {
            ...toolCall.function,
            arguments: JSON.stringify(evalArgs),
          },
        });

        // Cache result
        if (depth >= MIN_CACHE_DEPTH && result.result && !result.error) {
          const cacheKey = getEvalCacheKey(currentFen, depth);
          this.evalCache.set(cacheKey, result.result as EvaluatePositionResult);

          // Cache on tree node
          const evalResult = result.result as Record<string, unknown>;
          tree.setEngineEval({
            score: (evalResult.evaluation as number) ?? 0,
            depth,
            bestLine: (evalResult.principalVariation as string[]) ?? [],
            timestamp: Date.now(),
          });
        }

        return result;
      }

      case 'predict_human_moves': {
        const predictArgs = {
          fen: tree.getCurrentNode().fen,
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
        const lookupArgs = { fen: tree.getCurrentNode().fen };
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
          fen: tree.getCurrentNode().fen,
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

      // === Stopping ===
      case 'assess_continuation': {
        const node = tree.getCurrentNode();
        // Calculate depth from root
        let depth = 0;
        let current = node;
        while (current.parent) {
          depth++;
          current = current.parent;
        }

        const assessment = assessContinuation(
          node.fen,
          previousEval,
          currentEval,
          depth,
          toolCallsUsed,
          this.stoppingConfig,
        );
        return assessment;
      }

      case 'finish_exploration': {
        return { finished: true, summary: args.summary };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  /**
   * Build the system prompt for tree-based exploration
   */
  private buildSystemPrompt(targetRating: number): string {
    return `You are a chess coach showing a student what they did wrong and what they should have done.

TARGET AUDIENCE: ${targetRating} rated players

## YOUR POSITION

You start AT the move that was played (not before it).
This means you can IMMEDIATELY use add_alternative to show better moves.

## YOUR TOOLS

**Show alternatives (what SHOULD have been played):**
- add_alternative(san) - Add a better move as a sibling. You stay at current position.
- go_to(fen) - Navigate to the alternative's FEN to explore it.
- add_move(san) - Continue the line by adding a child move. You move to it.

**Annotate (do this INLINE as you explore, not at the end):**
- annotate(comment, nags) - Add brief comment (2-8 words, lowercase, no punctuation)
  GOOD: "wins the exchange", "threatens mate", "strong outpost"
  BAD: "From our perspective, this move is passive and misses..."

**Finish:**
- finish_exploration(summary) - When done exploring

**Analysis (use sparingly):**
- evaluate_position - Get engine evaluation
- predict_human_moves - What would a ${targetRating} player do?

## WORKFLOW

1. Call evaluate_position to see what's best
2. add_alternative(betterMove) to show the improvement
3. go_to the alternative's FEN
4. annotate with a SHORT comment (2-8 words)
5. add_move to continue the line 4-8 more moves
6. annotate key moments along the way
7. finish_exploration when done

## EXAMPLE

Position at 12. Qe2 (an inaccuracy). Engine says Re1 was better.

1. evaluate_position           → "Re1 is +1.2, Qe2 is +0.6"
2. add_alternative("Re1")      → Creates sibling to Qe2, returns FEN
3. go_to(<Re1_fen>)            → Navigate to Re1 position
4. annotate("activates the rook")
5. add_move("Nd7")             → Continue: 12...Nd7
6. add_move("Ne5")             → 13. Ne5
7. annotate("strong outpost")
8. finish_exploration("showed Re1 improvement")

Result: (12. Re1 {activates the rook} Nd7 13. Ne5 {strong outpost})

## CRITICAL RULES

1. **add_alternative = create sideline** (you stay put, creates sibling)
2. **add_move = continue line** (you move to the new position)
3. **Annotate INLINE** as you explore, not all at the end
4. **Comments: 2-8 words only** - lowercase, no punctuation
5. **NEVER say "from our perspective" or "this move is"**
6. **NEVER repeat move notation in comments**`;
  }

  /**
   * Build initial context for exploration
   */
  private buildInitialContext(
    fen: string,
    board: string,
    playedMove?: string,
    moveClassification?:
      | 'book'
      | 'excellent'
      | 'good'
      | 'inaccuracy'
      | 'mistake'
      | 'blunder'
      | 'brilliant'
      | 'forced',
  ): string {
    const parts: string[] = [];

    if (playedMove) {
      // LLM starts AT the played move (we already added it to the tree)
      const classLabel = moveClassification ? ` (${moveClassification})` : '';
      parts.push(`YOU ARE AT: ${playedMove}${classLabel}`);
      parts.push('');
      parts.push(board);
      parts.push('');
      parts.push(`FEN: ${fen}`);
      parts.push('');

      if (moveClassification === 'blunder' || moveClassification === 'mistake') {
        parts.push('This was a significant error. Show what should have been played:');
        parts.push('1. add_alternative(betterMove) - creates sibling to this move');
        parts.push('2. go_to the alternative FEN');
        parts.push('3. add_move to continue 4-8 moves deep');
        parts.push('4. annotate key moments (2-8 words each)');
      } else if (moveClassification === 'inaccuracy') {
        parts.push('This was slightly inaccurate. Show the stronger option:');
        parts.push('1. add_alternative(betterMove)');
        parts.push('2. go_to and explore briefly');
        parts.push('3. annotate the key difference');
      } else {
        parts.push('Explore alternatives from this position.');
      }
    } else {
      parts.push('POSITION:');
      parts.push('');
      parts.push(board);
      parts.push('');
      parts.push(`FEN: ${fen}`);
      parts.push('');
      parts.push('Explore the key variations from this position.');
    }

    parts.push('');
    parts.push('Start with evaluate_position to see the best moves.');

    return parts.join('\n');
  }
}

/**
 * Convert MoveInfo[] to ExploredLine[] for backward compatibility with orchestrator
 *
 * The tree produces variations embedded in MoveInfo[]. This extracts them
 * into the flat ExploredLine format used by the legacy flow.
 */
function convertMoveInfoToExploredLines(moves: MoveInfo[]): ExploredLine[] {
  const exploredLines: ExploredLine[] = [];

  // Find variations in the move list
  for (const move of moves) {
    if (move.variations && move.variations.length > 0) {
      for (const variation of move.variations) {
        const exploredLine = variationToExploredLine(variation);
        exploredLines.push(exploredLine);
      }
    }
  }

  return exploredLines;
}

/**
 * Convert a single MoveInfo[] variation to ExploredLine format
 */
function variationToExploredLine(variation: MoveInfo[]): ExploredLine {
  const moveSans: string[] = [];
  const annotations = new Map<number, string>();
  const nags = new Map<number, string>();
  const branches: ExploredLine[] = [];

  for (let i = 0; i < variation.length; i++) {
    const move = variation[i]!;
    moveSans.push(move.san);

    if (move.commentAfter) {
      annotations.set(i, move.commentAfter);
    }

    if (move.nags && move.nags.length > 0) {
      nags.set(i, move.nags[0]!);
    }

    // Recursively convert nested variations
    if (move.variations && move.variations.length > 0) {
      for (const subVariation of move.variations) {
        branches.push(variationToExploredLine(subVariation));
      }
    }
  }

  const purpose: LinePurpose = 'thematic'; // Default purpose for tree-generated lines
  const source: LineSource = 'llm'; // All lines from LLM exploration

  return {
    moves: moveSans,
    annotations,
    nags,
    branches,
    purpose,
    source,
  };
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
