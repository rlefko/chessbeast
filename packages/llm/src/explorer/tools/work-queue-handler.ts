/**
 * Work Queue Tool Handler
 *
 * Handles tools for tracking interesting moves to explore.
 * Tools: mark_interesting, get_interesting, clear_interesting
 */

import type { ToolCall } from '../../tools/types.js';

import type { ToolExecutionContext, ToolHandler } from './tool-router.js';

/**
 * Handler for work queue tools
 */
export class WorkQueueToolHandler implements ToolHandler {
  readonly toolNames = ['mark_interesting', 'get_interesting', 'clear_interesting'] as const;

  async execute(
    _toolCall: ToolCall,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    const { tree } = context;
    const toolName = _toolCall.function.name;

    switch (toolName) {
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

      default:
        return { success: false, error: `Unknown work queue tool: ${toolName}` };
    }
  }
}
