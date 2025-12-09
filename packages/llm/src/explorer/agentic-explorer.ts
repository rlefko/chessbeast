/**
 * Agentic Variation Explorer (Tree-Based)
 *
 * @deprecated This module is deprecated in favor of the new Ultra-Fast Coach architecture.
 * Use {@link EngineDrivenExplorer} from './engine-driven-explorer.js' instead.
 *
 * The new architecture:
 * - Engine explores via PriorityQueueExplorer (no LLM calls during exploration)
 * - LLM generates comments post-write via PostWritePipeline
 * - Much faster (engine-driven) and more cost-effective (1 LLM call per comment)
 *
 * This legacy agentic explorer:
 * - Uses LLM tool-calling loop (20+ LLM calls per position)
 * - LLM navigates a variation tree in real-time
 * - Still works but will be removed in a future version
 *
 * Original description:
 * A fully agentic system where the LLM navigates a variation tree:
 * - Each node = one move with metadata (comment, NAGs, engine cache)
 * - One child marked "principal" = main line
 * - LLM navigates via add_move, add_alternative, go_to
 * - Tree structure automatically produces correct PGN
 *
 * No more start_branch/end_branch - the tree handles variation nesting.
 */

import { classifyMoveWithStrategy, type AnnotationResult } from '@chessbeast/core';
import { ChessPosition, renderBoard, formatBoardForPrompt } from '@chessbeast/pgn';
import type { MoveInfo } from '@chessbeast/pgn';

import { EvaluationCache } from '../cache/evaluation-cache.js';
import {
  PositionCardBuilder,
  formatPositionCard,
  selectCardTier,
  type PositionCard,
} from '../cards/index.js';
import type { OpenAIClient } from '../client/openai-client.js';
import type { ChatMessage, ToolChoice } from '../client/types.js';
import type { LLMConfig } from '../config/llm-config.js';
import { ToolExecutor } from '../tools/executor.js';
import type { AgenticServices, ToolCall } from '../tools/types.js';

import {
  detectAlternativeCandidates,
  getAlternativeCandidateConfig,
  type EngineCandidate,
  type MaiaPrediction,
} from './candidate-classifier.js';
import { EXPLORATION_TOOLS } from './exploration-tools.js';
import {
  assessContinuation,
  getBudgetGuidance,
  type StoppingConfig,
  DEFAULT_STOPPING_CONFIG,
} from './stopping-heuristics.js';
import { COMMENT_LIMITS, type CommentType, type AlternativeCandidate } from './types.js';
import type { ExploredLine, LinePurpose, LineSource } from './variation-explorer.js';
import { VariationTree } from './variation-tree.js';

/**
 * Validate and clean up LLM comment with context-aware limits
 *
 * Comment types:
 * - 'initial': Comment on the played move (brief pointer, 40-60 chars)
 * - 'variation_start': First comment in a variation line (40-60 chars)
 * - 'variation_middle': Comments during variation exploration (40-60 chars)
 * - 'variation_end': Summary comment at end of variation (80-120 chars)
 */
function validateAndCleanComment(
  comment: string,
  lastMoveSan?: string,
  commentType: CommentType = 'variation_middle',
): { cleaned: string; rejected: boolean; reason?: string; warning?: string } {
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
          'Comment should describe the position/move, not meta-commentary. Brief pointers like "allows Ne5" or "wins material".',
      };
    }
  }

  // Get limits for this comment type
  const limits = COMMENT_LIMITS[commentType];

  // Hard reject if exceeds hard limit
  if (comment.length > limits.hard) {
    return {
      cleaned: '',
      rejected: true,
      reason: `Comment too long (${comment.length} chars). Maximum ${limits.hard} chars for ${commentType}. Be more concise.`,
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

  // Soft warning if exceeds soft limit but under hard limit
  if (cleaned.length > limits.soft) {
    return {
      cleaned,
      rejected: false,
      warning: `Comment is ${cleaned.length} chars (soft limit: ${limits.soft}). Consider being more concise.`,
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
  /** Position card delivered after navigation actions (for debug logging) */
  positionCard?: PositionCard | undefined;
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
}

/**
 * Default configuration
 *
 * Tuned for deep exploration until positions are resolved:
 * - Higher tool call budget (300) for thorough exploration with multiple variations
 * - Soft cap at 200 (67% of hard) to allow deep main lines before wrap-up guidance
 * - Higher depth limit (100) to support very deep variations
 */
const DEFAULT_CONFIG: Required<AgenticExplorerConfig> = {
  maxToolCalls: 300,
  softToolCap: 200,
  maxDepth: 100,
  targetRating: 1500,
  warnCallback: () => {},
};

// Note: Engine eval caching has been removed. Position Cards handle caching.

/**
 * Agentic Variation Explorer (Tree-Based)
 */
export class AgenticVariationExplorer {
  private readonly config: Required<AgenticExplorerConfig>;
  private readonly stoppingConfig: StoppingConfig;
  private readonly toolExecutor: ToolExecutor;
  private readonly services: AgenticServices;
  private readonly cardBuilder: PositionCardBuilder;
  /** Shared evaluation cache for reducing redundant Stockfish calls */
  private readonly evaluationCache: EvaluationCache;

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

    // Auto-calculate soft cap as ~67% of hard limit if not explicitly provided
    // This ensures budget pressure doesn't kick in too early
    const autoSoftCap = Math.floor(this.config.maxToolCalls * 0.67);
    const effectiveSoftCap =
      config?.softToolCap !== undefined
        ? Math.min(config.softToolCap, this.config.maxToolCalls)
        : autoSoftCap;

    this.stoppingConfig = {
      ...DEFAULT_STOPPING_CONFIG,
      maxToolCalls: this.config.maxToolCalls,
      softToolCap: effectiveSoftCap,
      maxDepth: this.config.maxDepth,
    };
    this.services = services;

    // Create shared evaluation cache for reducing redundant Stockfish calls
    this.evaluationCache = new EvaluationCache({
      maxSize: 1000,
      ttlMs: 3600000, // 1 hour
    });

    // Pass shared cache to both ToolExecutor and PositionCardBuilder
    this.toolExecutor = new ToolExecutor(services, this.config.targetRating, this.evaluationCache);

    // Initialize the Position Card builder with shared cache
    this.cardBuilder = new PositionCardBuilder(
      {
        stockfish: services.stockfish,
        sf16: services.sf16,
        maia: services.maia,
        eco: services.eco,
        lichess: services.lichess,
        evaluationCache: this.evaluationCache,
      },
      {
        targetRating: this.config.targetRating,
      },
    );
  }

  /**
   * Get evaluation cache statistics (useful for debugging/logging)
   */
  getEvalCacheStats(): {
    hits: number;
    misses: number;
    hitRate: number;
    size: number;
    maxSize: number;
  } {
    return this.evaluationCache.getStats();
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
    evalCp?: number,
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

    // NOTE: We do NOT add the played move to the tree.
    // The LLM starts at the DECISION POINT (root = position BEFORE the move).
    // This allows the LLM to use add_move to add any alternatives directly.
    // The playedMove is passed to buildInitialContext for reference only.

    let toolCallCount = 0;
    let tokensUsed = 0;
    let finished = false;
    let summary: string | undefined;

    // Track evaluations for swing detection
    let previousEval: number | undefined;
    let currentEval: number | undefined;

    // Build initial context
    const systemPrompt = this.buildSystemPrompt(targetRating, evalCp);
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

    // Track the most recent position card for progress reporting
    let lastDeliveredCard: PositionCard | undefined;

    // Deliver initial Position Card for the starting position (always 'full' tier)
    try {
      const initialCard = await this.cardBuilder.build(startingFen, 0, 'full');
      const initialCardText = formatPositionCard(initialCard);
      messages.push({
        role: 'system',
        content: initialCardText,
      });

      // Store for progress reporting
      lastDeliveredCard = initialCard;

      // Initialize candidate tracking for soft move validation
      this.lastCandidatesFen = startingFen;
      this.lastCandidateMoves = new Set(initialCard.candidates.map((c) => c.san));

      // Initialize eval tracking
      if (!initialCard.isTerminal) {
        currentEval = initialCard.evaluation.cp;
      }
    } catch (cardError) {
      this.config.warnCallback?.(
        `Failed to build initial Position Card: ${cardError instanceof Error ? cardError.message : 'unknown error'}`,
      );
    }

    // Agentic exploration loop
    while (!finished && toolCallCount < this.config.maxToolCalls) {
      // Report initial card on first iteration, then clear it
      const cardToReport = toolCallCount === 0 ? lastDeliveredCard : undefined;
      if (toolCallCount === 0) {
        lastDeliveredCard = undefined;
      }

      onProgress?.({
        phase: toolCallCount === 0 ? 'starting' : 'exploring',
        toolCalls: toolCallCount,
        nodeCount: tree.getAllNodes().length,
        currentFen: tree.getCurrentNode().fen,
        currentSan: tree.getCurrentNode().san,
        positionCard: cardToReport,
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

        // Deliver Position Card after successful navigation actions
        const isNavigationTool = ['add_move', 'add_alternative', 'go_to', 'go_to_parent'].includes(
          toolName,
        );
        const wasSuccessful =
          typeof result === 'object' &&
          result !== null &&
          (result as Record<string, unknown>).success === true;

        // Track card built during this tool call
        let navigationCard: PositionCard | undefined;

        if (isNavigationTool && wasSuccessful) {
          try {
            const currentFen = tree.getCurrentNode().fen;
            const treeDepth = tree.getDepthFromRoot();
            // Select tier based on depth (deeper = lighter analysis)
            const tier = selectCardTier(treeDepth, false);
            const card = await this.cardBuilder.build(currentFen, treeDepth, tier);
            const cardText = formatPositionCard(card);

            messages.push({
              role: 'system',
              content: cardText,
            });

            // Store for progress reporting
            navigationCard = card;

            // Update last candidates for soft move validation
            this.lastCandidatesFen = currentFen;
            this.lastCandidateMoves = new Set(card.candidates.map((c) => c.san));

            // Update current eval from card for swing detection
            if (!card.isTerminal) {
              previousEval = currentEval;
              currentEval = card.evaluation.cp;
            }
          } catch (cardError) {
            // Log but don't fail exploration if card building fails
            this.config.warnCallback?.(
              `Failed to build Position Card: ${cardError instanceof Error ? cardError.message : 'unknown error'}`,
            );
          }
        }

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
          positionCard: navigationCard,
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

    // The main exploration line IS a variation (alternative to played move)
    // Also extract any nested sub-variations within it
    const variations: ExploredLine[] =
      moves.length > 0
        ? [
            // The exploration itself is the primary variation
            variationToExploredLine(moves),
            // Also extract nested variations (branches within the exploration)
            ...convertMoveInfoToExploredLines(moves),
          ]
        : [];

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

        // Get parent node info before adding move (for auto-NAG)
        const parentNodeForNag = tree.getCurrentNode();
        const parentFenForNag = parentNodeForNag.fen;
        const parentEval = parentNodeForNag.engineEval;

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

        // Auto-assign NAG based on win probability if we have evals on both positions
        let autoAnnotation: AnnotationResult | undefined;
        if (parentEval && newNode.engineEval) {
          // Determine if white made this move from FEN
          const isWhiteMove = parentFenForNag.includes(' w ');
          // Convert CachedEval to EngineEvaluation format
          const evalBefore = {
            cp: parentEval.score,
            depth: parentEval.depth,
            pv: parentEval.bestLine,
          };
          const evalAfter = {
            cp: newNode.engineEval.score,
            depth: newNode.engineEval.depth,
            pv: newNode.engineEval.bestLine,
          };
          autoAnnotation = classifyMoveWithStrategy(evalBefore, evalAfter, isWhiteMove, {
            fenBefore: parentFenForNag,
            fenAfter: newNode.fen,
          });

          // Add NAG to the node if one was assigned
          if (autoAnnotation.nag) {
            tree.addNag(autoAnnotation.nag);
          }
        }

        // Detect alternative candidates for the resulting position
        // This helps the LLM see human-likely alternatives worth exploring
        let alternativeCandidates: AlternativeCandidate[] | undefined;
        const treeDepth = tree.getDepthFromRoot();

        // Only detect alternatives if:
        // 1. Position is not terminal (checkmate/stalemate)
        // 2. Not too deep in the tree (avoid explosion)
        // 3. Maia service is available
        if (!pos.isCheckmate() && !pos.isStalemate() && treeDepth <= 12 && this.services.maia) {
          try {
            // Get engine candidates and Maia predictions for the new position
            const altEvalArgs = { fen: newNode.fen, depth: 16, multipv: 4 };
            const [altEngineResult, altMaiaResult] = await Promise.all([
              this.toolExecutor.execute({
                id: `alt-eval-${Date.now()}`,
                type: 'function' as const,
                function: {
                  name: 'evaluate_position',
                  arguments: JSON.stringify(altEvalArgs),
                },
              }),
              this.toolExecutor.execute({
                id: `alt-maia-${Date.now()}`,
                type: 'function' as const,
                function: {
                  name: 'predict_human_moves',
                  arguments: JSON.stringify({
                    fen: newNode.fen,
                    rating: this.config.targetRating,
                  }),
                },
              }),
            ]);

            if (!altEngineResult.error) {
              const altEvalResult = altEngineResult.result as Record<string, unknown>;

              // Extract Maia predictions
              let altMaiaPredictions: MaiaPrediction[] | undefined;
              if (altMaiaResult.result) {
                const maiaData = altMaiaResult.result as {
                  predictions?: Array<{ move: string; probability: number }>;
                };
                if (maiaData.predictions && maiaData.predictions.length > 0) {
                  altMaiaPredictions = maiaData.predictions.map((p) => ({
                    san: p.move,
                    probability: p.probability,
                  }));
                }
              }

              // Build engine candidates
              const altEngineCandidates: EngineCandidate[] = [];
              if (altEvalResult.lines && Array.isArray(altEvalResult.lines)) {
                for (const line of altEvalResult.lines as Array<Record<string, unknown>>) {
                  const pv = line.principalVariation as string[] | undefined;
                  const move = pv?.[0];
                  if (move) {
                    altEngineCandidates.push({
                      move,
                      evaluation: (line.evaluation as number) ?? 0,
                      isMate: (line.isMate as boolean) ?? false,
                      pv: pv ?? [],
                    });
                  }
                }
              }

              // Detect alternative candidates worth exploring
              if (altEngineCandidates.length > 0) {
                const altConfig = getAlternativeCandidateConfig(this.config.targetRating);
                // Exclude the engine's best move (which is likely what will be played next)
                const bestMove = altEngineCandidates[0]?.move ?? '';
                alternativeCandidates = detectAlternativeCandidates(
                  bestMove,
                  altEngineCandidates,
                  altMaiaPredictions,
                  altConfig,
                );
              }
            }
          } catch {
            // Silent failure - alternative detection is an enhancement, not critical
          }
        }

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
          // Include auto-NAG info so LLM knows what was assigned
          ...(autoAnnotation?.nag && {
            autoNag: autoAnnotation.nag,
            autoNagInfo: {
              winProbDrop: `${autoAnnotation.metadata.winProbDrop > 0 ? '-' : '+'}${Math.abs(autoAnnotation.metadata.winProbDrop).toFixed(1)}%`,
              classification: autoAnnotation.classification,
              isSacrifice: autoAnnotation.metadata.isSacrifice,
            },
            note: 'Auto-assigned NAG based on win probability. Use add_move_nag to change or clear_nags to remove.',
          }),
          // Include alternative candidates for the LLM to consider
          ...(alternativeCandidates &&
            alternativeCandidates.length > 0 && {
              alternativeCandidates,
              alternativesNote: `${alternativeCandidates.length} alternative(s) detected for this position. Use your discretion to explore any that show a NEW instructive idea (different strategy, refutation, human-likely trap).`,
            }),
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

        // Get grandparent eval for auto-NAG (parent of current = position where alternative is played)
        const grandparentNode = tree.getCurrentNode().parent;
        const grandparentEval = grandparentNode?.engineEval;
        const grandparentFen = grandparentNode?.fen;

        const result = tree.addAlternative(san);
        if (!result.success) {
          return { success: false, error: result.error };
        }

        // Auto-assign NAG to the alternative if we have evals
        let autoAnnotation: AnnotationResult | undefined;
        if (grandparentEval && result.node?.engineEval && grandparentFen) {
          const isWhiteMove = grandparentFen.includes(' w ');
          // Convert CachedEval to EngineEvaluation format
          const evalBefore = {
            cp: grandparentEval.score,
            depth: grandparentEval.depth,
            pv: grandparentEval.bestLine,
          };
          const evalAfter = {
            cp: result.node.engineEval.score,
            depth: result.node.engineEval.depth,
            pv: result.node.engineEval.bestLine,
          };
          autoAnnotation = classifyMoveWithStrategy(evalBefore, evalAfter, isWhiteMove, {
            fenBefore: grandparentFen,
            fenAfter: result.node.fen,
          });

          // Add NAG to the alternative node
          if (autoAnnotation.nag && result.node) {
            result.node.nags.push(autoAnnotation.nag);
          }
        }

        return {
          success: true,
          message: result.message,
          alternativeFen: result.node?.fen,
          alternativeSan: result.node?.san,
          currentFen: tree.getCurrentNode().fen,
          note: 'You remain at your current position. Use go_to to navigate to the alternative.',
          ...(validationWarning && { warning: validationWarning }),
          // Include auto-NAG info for the alternative
          ...(autoAnnotation?.nag && {
            autoNag: autoAnnotation.nag,
            autoNagInfo: {
              winProbDrop: `${autoAnnotation.metadata.winProbDrop > 0 ? '-' : '+'}${Math.abs(autoAnnotation.metadata.winProbDrop).toFixed(1)}%`,
              classification: autoAnnotation.classification,
              isSacrifice: autoAnnotation.metadata.isSacrifice,
            },
          }),
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

        // Determine comment type based on tree position
        const currentNode = tree.getCurrentNode();
        const depth = tree.getDepthFromRoot();
        const hasChildren = currentNode.children && currentNode.children.length > 0;
        const commentTypeArg = args.type as string | undefined;

        let commentType: CommentType;
        if (depth === 0) {
          // At root = initial comment on played move
          commentType = 'initial';
        } else if (depth === 1) {
          // First move in variation
          commentType = 'variation_start';
        } else if (!hasChildren && commentTypeArg === 'summary') {
          // Leaf node with summary type = variation end
          commentType = 'variation_end';
        } else {
          // Default for mid-variation
          commentType = 'variation_middle';
        }

        const { cleaned, rejected, reason, warning } = validateAndCleanComment(
          comment,
          currentNode.san,
          commentType,
        );
        if (rejected) {
          return { success: false, error: reason };
        }
        tree.setComment(cleaned);

        const result: Record<string, unknown> = {
          success: true,
          comment: tree.getCurrentNode().comment,
        };
        if (warning) {
          result.warning = warning;
        }
        return result;
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

      // === Analysis Tools (REMOVED) ===
      // Analysis tools have been removed in favor of Position Cards.
      // The following tools are no longer available:
      // - get_candidate_moves: Candidates provided in Position Card
      // - evaluate_position: Evaluation provided in Position Card
      // - predict_human_moves: Maia predictions provided in Position Card
      // - lookup_opening: Opening info provided in Position Card
      // - find_reference_games: Reference games provided in Position Card
      //
      // Position Cards are delivered via system message after navigation actions.
      // If any of these tools are called, they fall through to the default case.

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
   * Build the system prompt for tree-based exploration (Position Card version)
   */
  private buildSystemPrompt(targetRating: number, evalCp?: number): string {
    let prompt = `You are a chess coach showing a student what they did wrong and what they should have done.

TARGET AUDIENCE: ${targetRating} rated players

## YOUR POSITION

You start at the DECISION POINT - the position BEFORE the move was played.
The board shows the position where the player had to choose what to do.

Use **add_move** to add better alternatives. Do NOT use add_alternative at the starting position.

## POSITION CARDS (Automatic)

After every navigation action (add_move, add_alternative, go_to, go_to_parent), you receive a **Position Card** in a system message.

**Evaluation Convention:**
All evaluations are from White's perspective. Positive = White advantage, Negative = Black advantage.

**Card Contents:**
- **Recommendation**: EXPLORE / BRIEF / SKIP with reason
- **Candidates**: Top engine + Maia moves with sources and per-move analysis:
  - Sources: engine_best, near_best, human_popular, attractive_but_bad, sacrifice, etc.
  - Each candidate includes a **shallow card** with:
    - eval (centipawns from White's perspective)
    - classical features breakdown after playing that move
- **Evaluation**: Overall position eval (centipawns, White's perspective) and win probability
- **Maia Prediction**: What a ${targetRating} player would play (probability %)
- **Motifs**: Detected patterns (pin, fork, back_rank_weakness, etc.)
- **Classical Features**: SF16 breakdown with **mg** (middlegame) and **eg** (endgame) values in pawns
  - Components: mobility, king_safety, space, threats, passed pawns
- **Opening**: ECO code and name (if in book)

**You DON'T need to call tools to get analysis - it's delivered automatically in cards.**

**Reading Cards:**
1. Check the recommendation first (EXPLORE means dig deep, BRIEF means show key point, SKIP means move on)
2. Look at candidates - each has a shallow card showing how the position changes after that move
3. Compare candidate shallow cards to see which moves improve mobility, king safety, space, etc.
4. Use motifs to inform your commentary (mention pins, forks, etc.)
5. Classical features help explain WHY (e.g., "White has space advantage")

## NAVIGATION TOOLS

- **add_move(san)** - Add a move as a child and navigate to it. Use this for ALL new moves! A Position Card arrives after.
- **add_alternative(san)** - Add a sibling move (same parent). Only works AFTER you've navigated away from root.
- **go_to(fen)** - Navigate to any position in the tree by FEN. Position Card arrives after.
- **go_to_parent** - Navigate back to the parent position. Position Card arrives after.
- **get_position** - Get info about current node (FEN, children, parent, etc.)
- **get_tree** - Get ASCII visualization of the entire tree

## ANNOTATION TOOLS

Comments:
- **set_comment(comment, type?)** - Add comment. type='pointer' (default) or 'summary' for variation endings
- 5-12 words typical, longer OK for complex strategic positions
- lowercase, no ending punctuation, no move notation

Move Quality NAGs (use freely on any move):
- **add_move_nag(nag)** - $1=!, $2=?, $3=!!, $4=??, $5=!?, $6=?!

Position Evaluation NAGs (ONLY at END of variation!):
- **set_position_nag(nag)** - $10=equal, $14/15=slight edge, $16/17=clear advantage, $18/19=winning
- ⚠️ NEVER use position NAGs mid-variation. ONLY at the final position!

## SHOW DON'T TELL PHILOSOPHY

Your primary job is to SHOW through variations, not TELL through long explanations.

**Played move comment pattern:**
- OPTIONAL: Only add if it clarifies something the variation doesn't show
- Keep it a POINTER: "allows Ne5" not "this allows the strong Ne5 maneuver"
- Let the variation DEMONSTRATE the idea

**Good examples:**
- 12. Qe2?! {allows Ne5} (12. Re1 $1 Nd7 13. Ne5 $14 {central pressure})
- 15. f3?? {drops the queen} (15. Qd2 Nc6 $10)
- 8. Bb5? (8. d4! $1 {opens the center} exd4 9. e5 $16)

**Bad examples (too verbose):**
- {This move is inaccurate because it allows White to play Ne5...}
- {The problem with this queen move is that it fails to address...}

## CANDIDATE MOVE SOURCES (from Position Cards)

Position Cards include classified candidates with sources like:
- **engine_best** - Engine's top choice
- **near_best** - Strong alternative (within 50cp of best)
- **human_popular** - High probability move for ${targetRating} players
- **attractive_but_bad** - **IMPORTANT**: Looks good to humans but actually loses!
- **scary_check/capture** - Tactical moves that look forcing
- **sacrifice** - Material sacrifice with compensation

## EXPLORING ATTRACTIVE-BUT-BAD MOVES

When a Position Card shows moves with source "attractive_but_bad":

1. These are TRAPS - moves that look good but fail to a specific refutation
2. Consider exploring these moves to show WHY they fail (highly encouraged!)
3. Use add_move to play the tempting move, then show the punishment
4. Comment style: "{tempting but...}" at start, "{the point}" at refutation

**Example workflow:**
1. Position Card shows Nxe4 as attractive_but_bad (35% would play, loses to Bxf7+)
2. add_move("Nxe4") → Card arrives showing refutation in candidates
3. add_move_nag("$6")  // dubious
4. set_comment("tempting but loses material")
5. add_move("Bxf7+")   // the refutation (from card)
6. set_comment("the point")
7. Continue until punishment is clear
8. set_position_nag at end showing decisive advantage

**Why this matters:**
Players learn more from understanding WHY tempting moves fail than just seeing the best move.

## EXPLORATION DEPTH REMINDER

You have a generous tool budget. Don't rush to finish after one variation.

After completing a main line, consider:
- Did you show WHY the played move was bad? (not just what's better)
- Are there attractive_but_bad moves worth refuting?
- Would a second variation teach something NEW?

Trust your judgment, but lean toward more exploration when in doubt.

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

## EXPLORING SIDELINES (BOTH SIDES)

After add_move, the Position Card may highlight alternatives worth exploring.
Use your discretion to explore sidelines that demonstrate NEW IDEAS.

**When to explore a sideline:**
1. **New tactical idea** - A tactic, trap, or combination not shown in main line
2. **Different strategic approach** - Solid vs aggressive, prophylaxis vs action
3. **Refutation of tempting move** - Show WHY an attractive move fails
4. **Human-likely alternative** - What players at this rating would actually consider
5. **Critical decision point** - Multiple moves with very different character

**When NOT to explore:**
1. **Redundant** - Same idea already demonstrated in another line
2. **Trivial difference** - Just move order or transposition
3. **Already resolved** - Position evaluation is already decisive
4. **Too deep** - Already 12+ moves into a variation

**How to explore sidelines:**
1. After add_move, read the Position Card for interesting alternatives
2. Look for moves with different CHARACTER, not just different eval
3. Use add_alternative to create the sideline
4. Navigate to it and show the key idea (usually 3-8 moves)
5. Return with go_to_parent and continue main line

**Depth guidance for sidelines:**
- Main line: Full exploration until resolved (10-20+ moves)
- Key alternative: Medium depth (5-10 moves) - show the idea clearly
- Secondary alternative: Brief (3-5 moves) - just the point

## DISCRETION GUIDELINES

You have judgment about what's instructive. Ask yourself:

**Before adding a sideline:**
- "Does this show something NEW?" (tactic, strategy, refutation)
- "Would a human at ${targetRating} Elo consider this move?"
- "Is the idea already clear from other lines?"

**Prioritize sidelines that:**
- Refute attractive-but-bad moves (show why traps fail)
- Show aggressive alternatives when main line is solid
- Show solid alternatives when main line is sharp
- Demonstrate different piece placements or pawn structures

**Skip sidelines that:**
- Lead to the same position type with similar eval
- Are just move order differences
- Repeat a tactic already shown
- Are too deep in the tree (>12 moves into variation)

Trust your judgment. The goal is INSTRUCTIVE annotation, not exhaustive analysis.

## MOVE SELECTION (from Position Cards)

Pick moves from the Position Card's candidate list:
- **engine_best, near_best**: Strong moves
- **human_popular, maia_preferred**: What players actually consider
- **attractive_but_bad**: Worth exploring to show refutation

If you play a move not in candidates, you'll see a warning.
Exception: Obvious opponent responses (recaptures, only legal moves) don't need validation.

## WORKFLOW

1. **Read the Position Card** - Check recommendation, candidates, motifs
2. **add_move(san)** - Add a move from candidates → Position Card arrives
3. **set_comment** - Brief pointer using card insights (motifs, features)
4. **Repeat** - Read new card, continue line
5. At each position: Check card's recommendation (EXPLORE/BRIEF/SKIP)
   - EXPLORE: Dig deep, show multiple ideas
   - BRIEF: Show key point, then move on
   - SKIP: Position is resolved, backtrack or finish
6. Use **add_alternative** for sidelines with NEW ideas
7. **set_position_nag** - ONLY at variation endpoints
8. **go_to_parent** to explore branches
9. **finish_exploration** when all instructive ideas shown

## DEPTH GUIDANCE

Explore variations until the position is RESOLVED:
- Decisive advantage (±3.0 or more) that's stable
- Forced sequence completes (tactical combination resolves)
- Position quiets down with clear evaluation
- Aim for 10-20+ moves in main variations, not just 3-5

Don't stop early just because you've shown a few moves. Show WHY the line is good/bad.

## EXAMPLE

Position BEFORE 12. Qe2 (White's inaccuracy). Context says: "The player chose: Qe2"

[POSITION CARD - WHITE to move]
Recommendation: EXPLORE - multiple good alternatives, played move was inaccurate
Candidates:
  Re1: +1.2 [engine_best] → Nd7 Ne5 Nf6 Bf4
  Nc3: +0.9 [near_best]
  Bf4: +0.8 [near_best, aggressive]
Motifs: central_control, rook_activity

1. add_move("Re1")            → Position Card arrives for new position
2. set_comment("activates rook")
3. add_move_nag("$1")         → Mark Re1 as good move (!)

[POSITION CARD - BLACK to move]
Recommendation: EXPLORE
Candidates:
  Nd7: +1.1 (40% human) [engine_best, human_popular]
  c5: +0.9 (20% human) [near_best] → sharp play

4. add_move("Nd7")            → Card arrives
5. add_move("Ne5")            → Card arrives
6. set_comment("strong outpost")
7. ... continue until position is clarified ...
8. set_position_nag("$14")    → White slightly better

[Back to explore c5 alternative]
9. go_to_parent               → Back after Re1, Card arrives
10. add_alternative("c5")     → Create sideline
11. go_to(fen after c5)       → Navigate to explore it, Card arrives
12. add_move("dxc5")          → Card arrives
13. set_comment("sharp play, but White keeps edge")
14. set_position_nag("$14")   → Still White's favor

15. go_to(root)               → Back to decision point, Card arrives
16. add_alternative("Bf4")    → Second suggestion for White
17. ... briefly explore Bf4 ideas (5-8 moves) ...
18. finish_exploration

Result: 12. Re1 $1 {activates rook} Nd7 (12...c5 13. dxc5 {sharp but White keeps edge} $14) 13. Ne5 Nf6 14. Bf4 $14 (12. Bf4 ...)

## CRITICAL RULES

1. **Read Position Cards carefully** - They contain all analysis info you need
2. **Use candidate moves from cards** - Pick from engine_best, near_best, human_popular
3. **Use add_move at root** - Alternatives are children of the decision point
4. **add_move continues line** - Alternates colors after each move
5. **add_alternative only after navigating** - Creates siblings deep in a line
6. **Position NAGs ($10-$19) ONLY at the END** - Never mid-variation!
7. **Move NAGs ($1-$6) anytime** - Use freely to mark good/bad moves
8. **SHOW DON'T TELL** - Variations demonstrate, comments just point
9. **Comments: 5-12 words typical** - Longer OK for complex positions
10. **Played move comment is OPTIONAL** - Skip if variation is self-explanatory
11. **NEVER say "from our perspective" or "this move is"**
12. **Explore DEEP** - Don't stop at 3-5 moves, show full variations
13. **Explore attractive-but-bad moves** - Show WHY tempting moves fail
14. **Follow card recommendations** - EXPLORE/BRIEF/SKIP guide your depth
15. **Mark branch points** - Use mark_for_sub_exploration for interesting alternatives
16. **Explore sidelines with discretion** - Add sidelines that show NEW IDEAS
17. **Both sides matter** - Explore interesting alternatives for player AND opponent
18. **Avoid redundancy** - Don't repeat ideas already demonstrated elsewhere`;

    // Add winning position focus when position is already decided
    if (evalCp !== undefined && Math.abs(evalCp) >= 500) {
      const evalPawns = (Math.abs(evalCp) / 100).toFixed(1);
      const winningSide = evalCp > 0 ? 'White' : 'Black';
      prompt += `

## WINNING POSITION FOCUS

This position is already decided (${winningSide} is ${evalPawns} pawns ahead).
Focus your exploration on:
1. **Counterplay** - What threats does the opponent have?
2. **Traps** - What mistakes could throw away the win?
3. **Clean conversion** - What's the simplest winning path?

DO NOT spend tool calls proving +6 is better than +5.
FINISH quickly once the winning idea is clear.`;
    }

    return prompt;
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
      // LLM starts at the DECISION POINT (position BEFORE the move)
      const classLabel = moveClassification ? ` (${moveClassification})` : '';
      parts.push(`DECISION POINT: ${sideToMove} to move`);
      parts.push(`**The player chose: ${playedMove}${classLabel}**`);
      parts.push('');
      parts.push(`Show what ${sideToMove} SHOULD have played instead using add_move.`);
      parts.push('');
      parts.push(board);
      parts.push('');
      parts.push(`FEN: ${fen}`);
      parts.push('');

      if (moveClassification === 'blunder' || moveClassification === 'mistake') {
        parts.push('This was a significant error. Show what should have been played:');
        parts.push('1. Read the Position Card for best alternatives');
        parts.push('2. add_move(betterMove) - adds the better alternative');
        parts.push(`3. Continue the line (${opponentSide} responds, then ${sideToMove}, etc.)`);
        parts.push('4. set_comment on key moments (brief pointers)');
        parts.push('5. set_position_nag ONLY at the END of the line');
        parts.push('6. go_to_parent back to root to explore other options');
      } else if (moveClassification === 'inaccuracy') {
        parts.push('This was slightly inaccurate. Show the stronger option:');
        parts.push('1. Read the Position Card for better moves');
        parts.push('2. add_move(betterMove)');
        parts.push('3. Continue and explore briefly');
        parts.push('4. set_comment on the key difference');
        parts.push('5. set_position_nag ONLY at the END');
      } else {
        parts.push('Explore alternatives from this position using add_move.');
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
    parts.push('A Position Card with analysis will be provided shortly.');

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
