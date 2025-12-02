/**
 * Navigation Tool Handler
 *
 * Handles simple navigation tools for the variation tree.
 * Tools: get_position, go_to, go_to_parent, get_tree
 *
 * Note: add_move and add_alternative are handled separately due to their
 * complexity (auto-NAG, alternative candidate detection, etc.)
 */

import { renderBoard } from '@chessbeast/pgn';

import type { ToolCall } from '../../tools/types.js';

import type { ToolExecutionContext, ToolHandler } from './tool-router.js';

/**
 * Handler for simple navigation tools
 *
 * Complex navigation (add_move, add_alternative) remains in AgenticVariationExplorer
 * due to dependencies on candidate validation, auto-NAG, and alternative detection.
 */
export class NavigationToolHandler implements ToolHandler {
  readonly toolNames = ['get_position', 'go_to', 'go_to_parent', 'get_tree'] as const;

  async execute(
    _toolCall: ToolCall,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    const { tree } = context;
    const toolName = _toolCall.function.name;

    switch (toolName) {
      case 'get_position': {
        return {
          success: true,
          ...tree.getCurrentNodeInfo(),
          board: renderBoard(tree.getCurrentNode().fen),
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

      default:
        return { success: false, error: `Unknown navigation tool: ${toolName}` };
    }
  }
}
