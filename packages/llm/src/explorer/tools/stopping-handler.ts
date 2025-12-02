/**
 * Stopping Tool Handler
 *
 * Handles tools for controlling exploration flow and marking positions.
 * Tools: assess_continuation, finish_exploration, mark_for_sub_exploration
 */

import type { ToolCall } from '../../tools/types.js';
import { assessContinuation, type StoppingConfig } from '../stopping-heuristics.js';

import type { ToolExecutionContext, ToolHandler } from './tool-router.js';

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
 * Extended context for stopping handler with eval and sub-exploration state
 */
export interface StoppingToolContext extends ToolExecutionContext {
  /** Previous position evaluation (for swing detection) */
  previousEval?: number;
  /** Current position evaluation */
  currentEval?: number;
  /** Stopping configuration */
  stoppingConfig: StoppingConfig;
  /** Marked sub-positions (mutable) */
  markedSubPositions: MarkedSubPosition[];
}

/**
 * Handler for stopping/control tools
 */
export class StoppingToolHandler implements ToolHandler {
  readonly toolNames = [
    'assess_continuation',
    'finish_exploration',
    'mark_for_sub_exploration',
  ] as const;

  private readonly stoppingConfig: StoppingConfig;
  private markedSubPositions: MarkedSubPosition[] = [];

  constructor(stoppingConfig: StoppingConfig) {
    this.stoppingConfig = stoppingConfig;
  }

  /**
   * Set the marked sub-positions list (for sharing state with explorer)
   */
  setMarkedSubPositions(positions: MarkedSubPosition[]): void {
    this.markedSubPositions = positions;
  }

  /**
   * Get the marked sub-positions list
   */
  getMarkedSubPositions(): MarkedSubPosition[] {
    return this.markedSubPositions;
  }

  /**
   * Reset state for a new exploration
   */
  reset(): void {
    this.markedSubPositions = [];
  }

  async execute(
    _toolCall: ToolCall,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    const { tree, toolCallsUsed, previousEval, currentEval } = context;
    const toolName = _toolCall.function.name;

    switch (toolName) {
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
        return { success: false, error: `Unknown stopping tool: ${toolName}` };
    }
  }
}
