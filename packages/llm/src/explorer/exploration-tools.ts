/**
 * Exploration Tools for Agentic Variation Explorer
 *
 * Defines the complete toolset available to the LLM during exploration:
 * - Board visualization
 * - Move navigation (push/pop)
 * - Branching (start/end sub-variations)
 * - Annotation (comments, NAGs)
 * - Stopping assessment
 * - Existing tools (engine, maia, openings, games)
 */

import type { OpenAITool } from '../tools/types.js';

/**
 * Tool: Get ASCII board visualization
 */
export const GET_BOARD_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'get_board',
    description: 'Get ASCII visual representation of current position. Use this to see the board.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};

/**
 * Tool: Push a move forward
 */
export const PUSH_MOVE_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'push_move',
    description:
      'Play a move and advance the position. Returns new FEN, the ASCII board, and sample legal moves.',
    parameters: {
      type: 'object',
      properties: {
        move: {
          type: 'string',
          description: 'Move in SAN format (e.g., "Nf3", "e4", "O-O", "Qxh7+")',
        },
      },
      required: ['move'],
    },
  },
};

/**
 * Tool: Pop (undo) the last move
 */
export const POP_MOVE_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'pop_move',
    description: 'Undo the last move and return to previous position.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};

/**
 * Tool: Start a sub-variation
 */
export const START_BRANCH_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'start_branch',
    description:
      "Start a sub-variation from the current position. Use to show alternatives or 'what if' lines.",
    parameters: {
      type: 'object',
      properties: {
        purpose: {
          type: 'string',
          enum: ['best', 'human_alternative', 'refutation', 'trap', 'thematic'],
          description:
            'Why this branch is being explored: best=engine best, human_alternative=what people play, refutation=punishing error, trap=tempting but wrong, thematic=illustrates key idea',
        },
      },
      required: ['purpose'],
    },
  },
};

/**
 * Tool: End current sub-variation
 */
export const END_BRANCH_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'end_branch',
    description: 'End the current sub-variation and return to the parent line.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};

/**
 * Tool: Add comment to current move
 */
export const ADD_COMMENT_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'add_comment',
    description:
      'Add annotation to the last played move. IMPORTANT: You must play a move with push_move first before calling this. Keep it SHORT (2-6 words). Style: "the point", "threatening mate"',
    parameters: {
      type: 'object',
      properties: {
        comment: {
          type: 'string',
          description:
            'Short annotation text (2-6 words preferred). No numeric evaluations. Lowercase, no ending punctuation.',
        },
      },
      required: ['comment'],
    },
  },
};

/**
 * Tool: Add NAG symbol to current move
 */
export const ADD_NAG_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'add_nag',
    description: 'Add NAG (Numeric Annotation Glyph) symbol to the last played move.',
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
            '$1=! good, $2=? mistake, $3=!! brilliant, $4=?? blunder, $5=!? interesting, $6=?! dubious, $10=drawish, $13=unclear, $14=slight edge white, $15=slight edge black, $16=moderate advantage white, $17=moderate advantage black, $18=decisive advantage white, $19=decisive advantage black',
        },
      },
      required: ['nag'],
    },
  },
};

/**
 * Tool: Suggest NAG for a move based on engine analysis
 */
export const SUGGEST_NAG_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'suggest_nag',
    description:
      'Get NAG suggestion for the last played move based on engine analysis. Compares the move to the best move and returns appropriate move quality NAG ($1-$6) or "none".',
    parameters: {
      type: 'object',
      properties: {
        context: {
          type: 'string',
          description:
            'Optional context about why the move might be interesting (e.g., "sacrifices material", "only move")',
        },
      },
      required: [],
    },
  },
};

/**
 * Tool: Get evaluation NAG for end of line
 */
export const GET_EVAL_NAG_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'get_eval_nag',
    description:
      'Get position evaluation NAG for end of variation ($10=drawish, $13=unclear, $14-$19=advantage). Use at the end of a line to mark the resulting position.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};

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

/**
 * Tool: Evaluate position with engine
 *
 * Reused from agentic generator, provides engine evaluation and best line.
 */
export const EVALUATE_POSITION_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'evaluate_position',
    description: 'Get engine evaluation of current position including best line (PV).',
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
 *
 * Reused from agentic generator, provides human-likely moves at target rating.
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
 *
 * Reused from agentic generator.
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
 *
 * Reused from agentic generator.
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

/**
 * Complete exploration tool set
 *
 * Combines new exploration-specific tools with existing analytical tools.
 */
export const EXPLORATION_TOOLS: OpenAITool[] = [
  // Board & navigation
  GET_BOARD_TOOL,
  PUSH_MOVE_TOOL,
  POP_MOVE_TOOL,

  // Branching
  START_BRANCH_TOOL,
  END_BRANCH_TOOL,

  // Annotation
  ADD_COMMENT_TOOL,
  ADD_NAG_TOOL,
  SUGGEST_NAG_TOOL,
  GET_EVAL_NAG_TOOL,

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
