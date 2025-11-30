/**
 * Exploration Tools for Agentic Variation Explorer
 *
 * Tree-based navigation paradigm:
 * - Each node = one move with metadata (comment, NAGs, engine cache)
 * - Nodes have children (alternative continuations)
 * - One child marked "principal" = main line
 * - LLM navigates via add_move, add_alternative, go_to instead of managing branches
 */

import type { OpenAITool } from '../tools/types.js';

// =============================================================================
// NAVIGATION TOOLS
// =============================================================================

/**
 * Tool: Get current position info
 */
export const GET_POSITION_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'get_position',
    description:
      'Get info about current node: FEN, children moves, parent FEN, principal child, interesting moves queue, and engine eval (if cached).',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};

/**
 * Tool: Add move and navigate to it
 */
export const ADD_MOVE_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'add_move',
    description:
      'Play a move, adding it as a child of current node, then navigate to the new position. Use this to CONTINUE a line. If the move already exists as a child, just navigates to it.',
    parameters: {
      type: 'object',
      properties: {
        san: {
          type: 'string',
          description: 'Move in SAN format (e.g., "Nf3", "e4", "O-O", "Qxh7+")',
        },
      },
      required: ['san'],
    },
  },
};

/**
 * Tool: Add alternative move (creates sibling, stays at current position)
 */
export const ADD_ALTERNATIVE_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'add_alternative',
    description:
      'Add an alternative move at current position (sibling to current node). You stay at your current position. Use this to CREATE a sideline. To explore the alternative, use go_to with its FEN.',
    parameters: {
      type: 'object',
      properties: {
        san: {
          type: 'string',
          description: 'Alternative move in SAN format',
        },
      },
      required: ['san'],
    },
  },
};

/**
 * Tool: Navigate to position by FEN
 */
export const GO_TO_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'go_to',
    description:
      'Jump to a position in the tree by its FEN. If multiple nodes have this FEN (transposition), prefers the one on the principal path.',
    parameters: {
      type: 'object',
      properties: {
        fen: {
          type: 'string',
          description: 'Target position FEN',
        },
      },
      required: ['fen'],
    },
  },
};

/**
 * Tool: Navigate to parent node
 */
export const GO_TO_PARENT_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'go_to_parent',
    description: 'Move up one level in the tree to the parent position.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};

/**
 * Tool: Get ASCII tree visualization
 */
export const GET_TREE_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'get_tree',
    description:
      'Get ASCII visualization of the entire variation tree. Shows all nodes, principal markers [P], and your current position.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};

// =============================================================================
// ANNOTATION TOOLS
// =============================================================================

/**
 * Tool: Annotate current node (comment and/or NAGs)
 */
export const ANNOTATE_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'annotate',
    description:
      'Add comment and/or NAGs to the current node. Comments should be SHORT (2-8 words), lowercase, no ending punctuation. NEVER repeat the move notation in comments.',
    parameters: {
      type: 'object',
      properties: {
        comment: {
          type: 'string',
          description:
            'Short annotation (2-8 words). Example: "wins material", "threatening mate", "the point"',
        },
        nags: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Array of NAGs. Move quality: $1=!, $2=?, $3=!!, $4=??, $5=!?, $6=?!. Position eval: $10=drawish, $13=unclear, $14-$15=slight edge, $16-$17=moderate advantage, $18-$19=decisive advantage',
        },
      },
      required: [],
    },
  },
};

/**
 * Tool: Add a single NAG to current node
 */
export const ADD_NAG_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'add_nag',
    description: 'Add a single NAG to current node (appends to existing NAGs).',
    parameters: {
      type: 'object',
      properties: {
        nag: {
          type: 'string',
          enum: [
            '$1',
            '$2',
            '$3',
            '$4',
            '$5',
            '$6',
            '$10',
            '$13',
            '$14',
            '$15',
            '$16',
            '$17',
            '$18',
            '$19',
          ],
          description:
            '$1=!, $2=?, $3=!!, $4=??, $5=!?, $6=?!, $10=drawish, $13=unclear, $14=slight edge white, $15=slight edge black, $16-$17=moderate advantage, $18-$19=decisive advantage',
        },
      },
      required: ['nag'],
    },
  },
};

/**
 * Tool: Set principal child
 */
export const SET_PRINCIPAL_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'set_principal',
    description:
      'Mark a child move as the principal continuation (main line) from current position.',
    parameters: {
      type: 'object',
      properties: {
        san: {
          type: 'string',
          description: 'SAN of the child move to mark as principal',
        },
      },
      required: ['san'],
    },
  },
};

// =============================================================================
// WORK QUEUE TOOLS (Interesting Moves)
// =============================================================================

/**
 * Tool: Mark moves as interesting (to explore later)
 */
export const MARK_INTERESTING_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'mark_interesting',
    description:
      'Add moves to the "to explore" queue for current position. Use this to track candidates you want to examine.',
    parameters: {
      type: 'object',
      properties: {
        moves: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of SAN moves to explore later (e.g., ["Nc3", "Bb5", "d4"])',
        },
      },
      required: ['moves'],
    },
  },
};

/**
 * Tool: Get interesting moves at current position
 */
export const GET_INTERESTING_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'get_interesting',
    description: 'Get the list of interesting moves still to explore at current position.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};

/**
 * Tool: Clear a move from interesting list
 */
export const CLEAR_INTERESTING_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'clear_interesting',
    description: 'Remove a move from the interesting list (after you have explored it).',
    parameters: {
      type: 'object',
      properties: {
        move: {
          type: 'string',
          description: 'SAN of the move to clear from the queue',
        },
      },
      required: ['move'],
    },
  },
};

// =============================================================================
// ANALYSIS TOOLS
// =============================================================================

/**
 * Tool: Evaluate position with engine
 */
export const EVALUATE_POSITION_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'evaluate_position',
    description:
      'Get engine evaluation of current position including best line (PV). Result is cached on the node.',
    parameters: {
      type: 'object',
      properties: {
        depth: {
          type: 'number',
          description: 'Analysis depth (default: 20, max: 24)',
        },
        numLines: {
          type: 'number',
          description: 'Number of lines to return (default: 1, max: 3)',
        },
      },
      required: [],
    },
  },
};

/**
 * Tool: Predict human moves with Maia
 */
export const PREDICT_HUMAN_MOVES_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'predict_human_moves',
    description: 'Predict what moves a human would play based on rating level.',
    parameters: {
      type: 'object',
      properties: {
        rating: {
          type: 'number',
          description: 'Target rating (1100-1900 in 100 increments)',
        },
      },
      required: [],
    },
  },
};

/**
 * Tool: Look up opening information
 */
export const LOOKUP_OPENING_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'lookup_opening',
    description: 'Look up opening name, ECO code, and typical plans from the database.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};

/**
 * Tool: Find reference games
 */
export const FIND_REFERENCE_GAMES_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'find_reference_games',
    description: 'Find master games that reached this position.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum games to return (default: 3)',
        },
      },
      required: [],
    },
  },
};

// =============================================================================
// STOPPING TOOLS
// =============================================================================

/**
 * Tool: Assess whether to continue exploring
 */
export const ASSESS_CONTINUATION_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'assess_continuation',
    description:
      'Check if the current position is worth continued exploration based on tension, eval swings, and budget.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Brief explanation of why you want to assess (optional)',
        },
      },
      required: [],
    },
  },
};

/**
 * Tool: Finish exploration
 */
export const FINISH_EXPLORATION_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'finish_exploration',
    description:
      'Signal that exploration is complete. Use when all important lines have been shown.',
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Brief summary of what was explored (1-2 sentences)',
        },
      },
      required: ['summary'],
    },
  },
};

// =============================================================================
// TOOL SETS
// =============================================================================

/**
 * Complete exploration tool set for tree-based navigation
 */
export const EXPLORATION_TOOLS: OpenAITool[] = [
  // Navigation
  GET_POSITION_TOOL,
  ADD_MOVE_TOOL,
  ADD_ALTERNATIVE_TOOL,
  GO_TO_TOOL,
  GO_TO_PARENT_TOOL,
  GET_TREE_TOOL,

  // Annotation
  ANNOTATE_TOOL,
  ADD_NAG_TOOL,
  SET_PRINCIPAL_TOOL,

  // Work queue
  MARK_INTERESTING_TOOL,
  GET_INTERESTING_TOOL,
  CLEAR_INTERESTING_TOOL,

  // Analysis
  EVALUATE_POSITION_TOOL,
  PREDICT_HUMAN_MOVES_TOOL,
  LOOKUP_OPENING_TOOL,
  FIND_REFERENCE_GAMES_TOOL,

  // Stopping
  ASSESS_CONTINUATION_TOOL,
  FINISH_EXPLORATION_TOOL,
];

/**
 * Tool names for quick reference
 */
export const EXPLORATION_TOOL_NAMES = EXPLORATION_TOOLS.map((t) => t.function.name);
