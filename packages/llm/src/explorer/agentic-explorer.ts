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
 * A position marked for sub-exploration
 */
export interface MarkedSubPosition {
  /** FEN of the position to explore */
  fen: string;
  /** Move that led to this position (for reference) */
  san: string;
  /** Reason why this position was marked interesting */
  reason: string;
  /** Priority for exploration order */
  priority: 'high' | 'medium' | 'low';
  /** Depth from root when marked */
  depthWhenMarked: number;
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
  /** Positions marked for sub-exploration */
  markedSubPositions?: MarkedSubPosition[];
  /** Cache statistics */
  cacheStats?: {
    hits: number;
    misses: number;
    hitRate: number;
  };
}

/**
 * Default configuration
 *
 * Tuned for deep exploration until positions are resolved:
 * - Higher tool call budget (200 vs 40) for 15-30 move variations
 * - Higher soft cap (80 vs 25) before wrap-up guidance triggers
 * - Higher depth limit (100 vs 50) to support very deep variations
 */
const DEFAULT_CONFIG: Required<AgenticExplorerConfig> = {
  maxToolCalls: 200,
  softToolCap: 80,
  maxDepth: 100,
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

  // State tracking for soft move validation
  private lastCandidateMoves: Set<string> = new Set();
  private lastCandidatesFen: string | null = null;

  // State tracking for sub-exploration positions
  private markedSubPositions: MarkedSubPosition[] = [];

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

    // Reset state for this exploration
    this.markedSubPositions = [];
    this.lastCandidateMoves = new Set();
    this.lastCandidatesFen = null;

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

    if (this.markedSubPositions.length > 0) {
      result.markedSubPositions = this.markedSubPositions;
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

        // Soft validation: check if move was in recent candidates
        const parentFen = tree.getCurrentNode().fen;
        let validationWarning: string | undefined;

        if (this.lastCandidatesFen === parentFen) {
          if (!this.lastCandidateMoves.has(san)) {
            validationWarning = `⚠️ Move ${san} was not in the candidate moves. Consider using get_candidate_moves to verify move quality.`;
          }
        } else if (this.lastCandidatesFen !== null) {
          // Different position - warn that no validation was done for this position
          validationWarning = `⚠️ No candidate moves checked for this position. Use get_candidate_moves to see best options.`;
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
          ...(validationWarning && { warning: validationWarning }),
        };
      }

      case 'add_alternative': {
        const san = args.san as string;
        if (!san) {
          return { success: false, error: 'No move provided' };
        }

        // Soft validation: check if move was in recent candidates
        // For add_alternative, we check the parent position (where alternatives are added)
        const parentNode = tree.getCurrentNode().parent;
        const parentFen = parentNode?.fen;
        let validationWarning: string | undefined;

        if (parentFen && this.lastCandidatesFen === parentFen) {
          if (!this.lastCandidateMoves.has(san)) {
            validationWarning = `⚠️ Move ${san} was not in the candidate moves. Consider using get_candidate_moves to verify move quality.`;
          }
        } else if (this.lastCandidatesFen !== null && parentFen) {
          // Different position - warn that no validation was done for this position
          validationWarning = `⚠️ No candidate moves checked for parent position. Use get_candidate_moves to see best options.`;
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
          ...(validationWarning && { warning: validationWarning }),
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
      case 'set_comment': {
        const comment = args.comment as string | undefined;
        if (!comment) {
          return { success: false, error: 'No comment provided' };
        }

        const { cleaned, rejected, reason } = validateAndCleanComment(
          comment,
          tree.getCurrentNode().san,
        );
        if (rejected) {
          return { success: false, error: reason };
        }
        tree.setComment(cleaned);

        return {
          success: true,
          comment: tree.getCurrentNode().comment,
        };
      }

      case 'get_comment': {
        return {
          success: true,
          comment: tree.getCurrentNode().comment ?? null,
        };
      }

      case 'add_move_nag': {
        const nag = args.nag as string;
        if (!nag) {
          return { success: false, error: 'No NAG provided' };
        }
        // Validate it's a move NAG ($1-$6)
        const moveNags = ['$1', '$2', '$3', '$4', '$5', '$6'];
        if (!moveNags.includes(nag)) {
          return {
            success: false,
            error: `Invalid move NAG: ${nag}. Must be one of: $1 (!), $2 (?), $3 (!!), $4 (??), $5 (!?), $6 (?!)`,
          };
        }
        tree.addNag(nag);
        return { success: true, nags: tree.getCurrentNode().nags };
      }

      case 'set_position_nag': {
        const nag = args.nag as string;
        if (!nag) {
          return { success: false, error: 'No NAG provided' };
        }
        // Validate it's a position NAG ($10-$19)
        const positionNags = ['$10', '$13', '$14', '$15', '$16', '$17', '$18', '$19'];
        if (!positionNags.includes(nag)) {
          return {
            success: false,
            error: `Invalid position NAG: ${nag}. Must be one of: $10 (=), $13 (∞), $14 (⩲), $15 (⩱), $16 (±), $17 (∓), $18 (+−), $19 (−+)`,
          };
        }
        // Remove any existing position NAGs first
        const currentNags = tree.getCurrentNode().nags.filter((n) => !positionNags.includes(n));
        tree.setNags([...currentNags, nag]);
        return { success: true, nags: tree.getCurrentNode().nags };
      }

      case 'get_nags': {
        return {
          success: true,
          nags: tree.getCurrentNode().nags,
        };
      }

      case 'clear_nags': {
        tree.setNags([]);
        return { success: true, nags: [] };
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
      case 'get_candidate_moves': {
        const currentFen = tree.getCurrentNode().fen;
        const count = Math.min(Math.max((args.count as number) ?? 3, 1), 5);

        // Get the side to move from FEN
        const fenParts = currentFen.split(' ');
        const sideToMove = fenParts[1] === 'w' ? 'White' : 'Black';

        // Use multipv analysis to get top N moves
        const evalArgs = { fen: currentFen, depth: 18, multipv: count };
        const result = await this.toolExecutor.execute({
          ...toolCall,
          function: {
            name: 'evaluate_position',
            arguments: JSON.stringify(evalArgs),
          },
        });

        // Extract the moves from the result
        if (result.error) {
          return { success: false, error: result.error };
        }

        const evalResult = result.result as Record<string, unknown>;

        // Check if we got multiple lines (multipv result)
        if (evalResult.lines && Array.isArray(evalResult.lines)) {
          const candidates = (evalResult.lines as Array<Record<string, unknown>>).map(
            (line, idx) => ({
              rank: idx + 1,
              move: (line.principalVariation as string[])?.[0] ?? 'unknown',
              evaluation: line.evaluation as number,
              line: (line.principalVariation as string[])?.slice(0, 4).join(' ') ?? '',
            }),
          );

          // Track candidates for soft validation
          this.lastCandidatesFen = currentFen;
          this.lastCandidateMoves = new Set(candidates.map((c) => c.move));

          return {
            success: true,
            sideToMove,
            candidates,
            note: `These are ${sideToMove}'s best moves. Use add_alternative to explore them.`,
          };
        }

        // Single line result (fallback)
        const pv = evalResult.principalVariation as string[] | undefined;
        const bestMove = pv?.[0] ?? 'unknown';

        // Track candidates for soft validation
        this.lastCandidatesFen = currentFen;
        this.lastCandidateMoves = new Set([bestMove]);

        return {
          success: true,
          sideToMove,
          candidates: [
            {
              rank: 1,
              move: bestMove,
              evaluation: evalResult.evaluation as number,
              line: pv?.slice(0, 4).join(' ') ?? '',
            },
          ],
          note: `This is ${sideToMove}'s best move. Use add_alternative to explore it.`,
        };
      }

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

      // === Sub-Exploration ===
      case 'mark_for_sub_exploration': {
        const reason = args.reason as string;
        if (!reason) {
          return { success: false, error: 'No reason provided' };
        }

        const node = tree.getCurrentNode();
        const priority = (args.priority as 'high' | 'medium' | 'low') ?? 'medium';

        // Calculate depth from root
        let depth = 0;
        let current = node;
        while (current.parent) {
          depth++;
          current = current.parent;
        }

        // Don't mark positions that are too deep (unlikely to be explored)
        if (depth > 20) {
          return {
            success: false,
            error: 'Position is too deep to mark for sub-exploration. Focus on the main line.',
            currentDepth: depth,
          };
        }

        // Check if already marked
        const alreadyMarked = this.markedSubPositions.some((p) => p.fen === node.fen);
        if (alreadyMarked) {
          return {
            success: true,
            message: 'Position was already marked for sub-exploration',
            fen: node.fen,
          };
        }

        // Add to marked positions
        this.markedSubPositions.push({
          fen: node.fen,
          san: node.san ?? '',
          reason,
          priority,
          depthWhenMarked: depth,
        });

        return {
          success: true,
          message: `Marked position for ${priority}-priority sub-exploration`,
          fen: node.fen,
          san: node.san,
          reason,
          priority,
          totalMarked: this.markedSubPositions.length,
          note: 'Continue exploring the main line. This position will be revisited later.',
        };
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

## NAVIGATION TOOLS

- **get_candidate_moves** - Get engine's best moves for the side to move. USE THIS FIRST!
- **add_alternative(san)** - Add a better move as a sibling. You stay at current position.
- **go_to(fen)** - Navigate to the alternative's FEN to explore it.
- **add_move(san)** - Continue the line by adding a child move. You move to it.

## ANNOTATION TOOLS

Comments:
- **set_comment(comment)** - Add/replace comment (2-8 words, lowercase, no punctuation)

Move Quality NAGs (use freely on any move):
- **add_move_nag(nag)** - $1=!, $2=?, $3=!!, $4=??, $5=!?, $6=?!

Position Evaluation NAGs (ONLY at END of variation!):
- **set_position_nag(nag)** - $10=equal, $14/15=slight edge, $16/17=clear advantage, $18/19=winning
- ⚠️ NEVER use position NAGs mid-variation. ONLY at the final position!

## ANALYSIS TOOLS

- **evaluate_position** - Get engine evaluation (use every 3-4 moves)
- **predict_human_moves** - What would a ${targetRating} player do?

## SUB-EXPLORATION

- **mark_for_sub_exploration(reason, priority)** - Flag current position for deeper analysis later

Use mark_for_sub_exploration when you encounter an interesting branch point:
- Multiple candidate moves have similar evaluations (within 30cp)
- Tactical complications exist (checks, captures, threats)
- A critical decision point for the player

Do NOT mark when:
- Position is quiet with one clear best move
- You're already deep in the variation (depth > 15)
- Line is nearly resolved (decisive evaluation)

## MOVE VALIDATION (IMPORTANT)

Before playing ANY move with add_move or add_alternative:
1. Call get_candidate_moves to see the best options
2. Choose from the candidate list when possible
3. If you play a move not in candidates, you'll see a warning

This ensures you don't unknowingly play mistakes during analysis.
Exception: Obvious opponent responses (recaptures, only legal moves) don't need validation.

## WORKFLOW

1. **get_candidate_moves** - See best moves for the side to move
2. **add_alternative(betterMove)** - Create the sideline
3. **go_to** the alternative's FEN
4. **set_comment** - Brief annotation (2-8 words)
5. **add_move** - Continue the line (get_candidate_moves every few moves)
6. **evaluate_position** - Validate the line is going where expected
7. Repeat add_move + evaluate_position until position is clarified
8. **mark_for_sub_exploration** if you see interesting branches
9. **set_position_nag** - ONLY at the very end when position is clarified
10. **finish_exploration**

## DEPTH GUIDANCE

Explore variations until the position is RESOLVED:
- Decisive advantage (±3.0 or more) that's stable
- Forced sequence completes (tactical combination resolves)
- Position quiets down with clear evaluation
- Aim for 10-20+ moves in main variations, not just 3-5

Don't stop early just because you've shown a few moves. Show WHY the line is good/bad.

## EXAMPLE

Position at 12. Qe2 (White's inaccuracy). Context says: "WHITE JUST PLAYED Qe2"

1. get_candidate_moves        → "White's best: Re1 (+1.2), Nc3 (+0.9), Qe2 (+0.6)"
2. add_alternative("Re1")     → Creates sibling to Qe2, returns FEN
3. go_to(<Re1_fen>)           → Navigate to Re1 position
4. set_comment("activates the rook")
5. add_move_nag("$1")         → Mark Re1 as good move (!)
6. get_candidate_moves        → "Black's best: Nd7, Be6, Qe7"
7. add_move("Nd7")            → Black responds: 12...Nd7
8. get_candidate_moves        → "White's best: Ne5 (+1.3), Bf4 (+1.1)"
9. add_move("Ne5")            → White: 13. Ne5
10. evaluate_position         → Confirm +1.3
11. set_comment("strong outpost")
12. mark_for_sub_exploration("Bf4 also interesting", "medium")
13. add_move("Nf6")           → Black: 13...Nf6
14. add_move("Bf4")           → White: 14. Bf4
15. ... continue until position is clarified ...
16. set_position_nag("$14")   → Slight White advantage (at END of line)
17. finish_exploration("Re1 activates rook with lasting initiative")

Result: (12. Re1 $1 {activates the rook} Nd7 13. Ne5 {strong outpost} Nf6 14. Bf4 $14)

## CRITICAL RULES

1. **get_candidate_moves FIRST** - Know what moves are legal and good!
2. **Validate moves** - Check candidates before playing, heed warnings
3. **add_alternative creates sibling** - Same color as the played move
4. **add_move continues line** - Alternates colors after each move
5. **Position NAGs ($10-$19) ONLY at the END** - Never mid-variation!
6. **Move NAGs ($1-$6) anytime** - Use freely to mark good/bad moves
7. **Comments: 2-8 words** - lowercase, no punctuation
8. **NEVER say "from our perspective" or "this move is"**
9. **Explore DEEP** - Don't stop at 3-5 moves, show full variations
10. **Mark branch points** - Use mark_for_sub_exploration for interesting alternatives`;
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

    // Determine whose move this is from the FEN (before the move was played)
    // If FEN shows 'w', the played move was White's; if 'b', it was Black's
    const fenParts = fen.split(' ');
    const sideToMove = fenParts[1] === 'w' ? 'WHITE' : 'BLACK';
    const opponentSide = fenParts[1] === 'w' ? 'BLACK' : 'WHITE';

    if (playedMove) {
      // LLM starts AT the played move (we already added it to the tree)
      const classLabel = moveClassification ? ` (${moveClassification})` : '';
      parts.push(`YOU ARE AT: ${playedMove}${classLabel}`);
      parts.push('');
      parts.push(`**${sideToMove} JUST PLAYED ${playedMove}**`);
      parts.push(`Alternatives must be ${sideToMove} moves (siblings replace ${playedMove}).`);
      parts.push('');
      parts.push(board);
      parts.push('');
      parts.push(`FEN: ${fen}`);
      parts.push('');

      if (moveClassification === 'blunder' || moveClassification === 'mistake') {
        parts.push('This was a significant error. Show what should have been played:');
        parts.push(`1. get_candidate_moves - see ${sideToMove}'s best options`);
        parts.push('2. add_alternative(betterMove) - creates sibling to this move');
        parts.push('3. go_to the alternative FEN');
        parts.push(`4. add_move to continue (${opponentSide} responds, then ${sideToMove}, etc.)`);
        parts.push('5. set_comment on key moments (2-8 words each)');
        parts.push('6. evaluate_position every 3-4 moves to validate the line');
        parts.push('7. set_position_nag ONLY at the END of the line');
      } else if (moveClassification === 'inaccuracy') {
        parts.push('This was slightly inaccurate. Show the stronger option:');
        parts.push(`1. get_candidate_moves - see ${sideToMove}'s best options`);
        parts.push('2. add_alternative(betterMove)');
        parts.push('3. go_to and explore briefly');
        parts.push('4. set_comment on the key difference');
        parts.push('5. set_position_nag ONLY at the END');
      } else {
        parts.push('Explore alternatives from this position.');
      }
    } else {
      parts.push('POSITION:');
      parts.push('');
      parts.push(`**${sideToMove} TO MOVE**`);
      parts.push('');
      parts.push(board);
      parts.push('');
      parts.push(`FEN: ${fen}`);
      parts.push('');
      parts.push('Explore the key variations from this position.');
    }

    parts.push('');
    parts.push('Start with get_candidate_moves to see the best options.');

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
