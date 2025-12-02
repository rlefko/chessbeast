/**
 * Annotation Tool Handler
 *
 * Handles comment and NAG annotation tools for the variation tree.
 * Tools: set_comment, get_comment, add_move_nag, set_position_nag, get_nags, clear_nags, set_principal
 */

import type { ToolCall } from '../../tools/types.js';
import { COMMENT_LIMITS, type CommentType } from '../types.js';

import type { ToolExecutionContext, ToolHandler } from './tool-router.js';

/**
 * Validate and clean up LLM comment with context-aware limits
 *
 * Comment types:
 * - 'initial': Comment on the played move (brief pointer, 75-150 chars)
 * - 'variation_start': First comment in a variation line (50-100 chars)
 * - 'variation_middle': Comments during variation exploration (50-100 chars)
 * - 'variation_end': Summary comment at end of variation (100-150 chars)
 */
export function validateAndCleanComment(
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
 * Valid move NAGs ($1-$6)
 */
const MOVE_NAGS = ['$1', '$2', '$3', '$4', '$5', '$6'];

/**
 * Valid position NAGs ($10-$19)
 */
const POSITION_NAGS = ['$10', '$13', '$14', '$15', '$16', '$17', '$18', '$19'];

/**
 * Handler for annotation tools
 */
export class AnnotationToolHandler implements ToolHandler {
  readonly toolNames = [
    'set_comment',
    'get_comment',
    'add_move_nag',
    'set_position_nag',
    'get_nags',
    'clear_nags',
    'set_principal',
  ] as const;

  async execute(
    _toolCall: ToolCall,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    const { tree } = context;
    const toolName = _toolCall.function.name;

    switch (toolName) {
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
        if (!MOVE_NAGS.includes(nag)) {
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
        if (!POSITION_NAGS.includes(nag)) {
          return {
            success: false,
            error: `Invalid position NAG: ${nag}. Must be one of: $10 (=), $13 (∞), $14 (⩲), $15 (⩱), $16 (±), $17 (∓), $18 (+−), $19 (−+)`,
          };
        }
        // Remove any existing position NAGs first
        const currentNags = tree.getCurrentNode().nags.filter((n) => !POSITION_NAGS.includes(n));
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

      default:
        return { success: false, error: `Unknown annotation tool: ${toolName}` };
    }
  }
}
