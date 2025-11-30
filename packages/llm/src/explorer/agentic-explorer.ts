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
  if (comment.length > 100) {
    return {
      cleaned: '',
      rejected: true,
      reason: 'Comment too long (max 100 chars). Keep it to 2-8 words.',
    };
  }

  let cleaned = comment;

  // Silent cleanup: Remove perspective phrases
  cleaned = cleaned.replace(
    /from\s+(black|white|my|their|black's|white's)\s+(perspective|point of view|pov|view|side)[,:]?\s*/gi,
    '',
  );

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
    // Initialize tree with game moves (pre-populated principal path)
    const tree = new VariationTree(startingFen);
    if (gameMoves && gameMoves.length > 0) {
      tree.initializeFromMoves(gameMoves);
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
    return `You are an expert chess analyst exploring variations in a tree structure.

TARGET AUDIENCE: ${targetRating} rated players

## THE TREE

You're navigating a tree where:
- Each node is a chess position (identified by FEN)
- The game's main line is already in the tree, marked as "principal"
- You add alternatives and annotations to create instructive analysis

## YOUR TOOLS

### Navigation
- get_position: Get current node info (FEN, children, parent, principal)
- add_move(san): Play a move, creating a child node. You move to it. Use to CONTINUE a line.
- add_alternative(san): Add a different move at current position. You stay here. Use to CREATE a sideline.
- go_to(fen): Jump to any position in the tree by FEN
- go_to_parent: Move up one level
- get_tree: See ASCII visualization of entire tree

### Annotation
- annotate(comment, nags): Add comment and/or NAGs to current node
- add_nag(nag): Add a single NAG ($1=!, $2=?, $3=!!, $4=??, $5=!?, $6=?!)
- set_principal(san): Mark a child as the main continuation

### Planning
- mark_interesting(moves): Note moves you want to explore later
- get_interesting: See what you haven't explored yet
- clear_interesting(move): Remove from list after exploring

### Analysis
- evaluate_position: Get engine evaluation (cached on node)
- predict_human_moves: What would a ${targetRating} player do?
- lookup_opening: Opening name and theory
- find_reference_games: Master games from this position

### Control
- assess_continuation: Should I keep exploring this line?
- finish_exploration: Signal completion

## KEY WORKFLOW

1. Start at the position to analyze
2. evaluate_position to understand what's happening
3. mark_interesting with candidate moves to explore
4. For each interesting move:
   - add_alternative(move) to create the sideline
   - go_to(alternative_fen) to navigate there
   - add_move to continue the line (8-15 moves deep)
   - annotate key moments
   - go_to(original_fen) when done
   - clear_interesting(move)
5. finish_exploration when complete

## EXAMPLE: Showing a Better Move

Position after 12...h6 (a mistake). Engine says 12...a5 was better.

\`\`\`
1. mark_interesting(["a5"])           // Note we want to show a5
2. add_alternative("a5")              // Create 12...a5 as alternative
3. go_to(<a5_fen>)                    // Move to that position
4. annotate("gaining queenside space")
5. add_move("Ne5")                    // Continue: 13.Ne5
6. add_move("Qb6")                    // 13...Qb6
7. add_move("Ba4")                    // 14.Ba4
8. add_move("bxa4")                   // 14...bxa4
9. annotate("wins the bishop pair")
10. go_to(<h6_fen>)                   // Back to main line
11. clear_interesting("a5")           // Done with a5
12. finish_exploration
\`\`\`

Result: Clean PGN with (12...a5 {comment} 13.Ne5 Qb6 14.Ba4 bxa4 {comment})

## CRITICAL RULES

1. **add_move CONTINUES a line** - adds child, moves to it
2. **add_alternative CREATES a sideline** - adds sibling, stays put
3. **Explore DEEPLY** - 8-15 moves for critical lines, don't stop mid-tactics
4. **Short comments only** - 2-8 words, lowercase, no ending punctuation
5. **NEVER repeat move notation in comments** - say "wins material" not "Nxg7 wins material"

## ANNOTATION STYLE

- Max 2 sentences per comment
- No numeric evaluations (use "winning", "slight edge", "equal")
- Focus on WHY, not just outcomes
- NAGs: $1=!, $2=?, $3=!!, $4=??, $5=!?, $6=?!, $14-$19 for position eval`;
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
    const parts = ['STARTING POSITION:', '', `FEN: ${fen}`, '', board];

    if (playedMove) {
      parts.push('');
      parts.push(`THE MOVE PLAYED WAS: ${playedMove}`);
      parts.push('');
      parts.push('The starting position is BEFORE this move was played.');

      if (moveClassification === 'blunder' || moveClassification === 'mistake') {
        parts.push('');
        parts.push('This move is a significant error. Your task:');
        parts.push('1. Use add_alternative to show what SHOULD have been played.');
        parts.push('2. Navigate to the alternative and explore deeply (8-15 moves).');
        parts.push('3. Annotate key moments explaining why the alternative is better.');
      } else if (moveClassification === 'inaccuracy') {
        parts.push('');
        parts.push('This move is slightly inaccurate. Your task:');
        parts.push('1. Use add_alternative to show the stronger option.');
        parts.push('2. Explain the key difference (may be subtle).');
      } else {
        parts.push('');
        parts.push('Explore the key continuations from this position.');
        parts.push('Use add_alternative to show important sidelines.');
      }
    } else {
      parts.push('');
      parts.push('Explore the key variations from this position.');
      parts.push('Use add_alternative for sidelines and add_move to continue lines.');
    }

    parts.push('');
    parts.push('Start by calling evaluate_position to understand the tactical themes.');

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
