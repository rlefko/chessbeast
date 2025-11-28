/**
 * Tool definitions for OpenAI function calling
 */

import type { OpenAITool } from './types.js';

/**
 * Tool: evaluate_position
 * Analyze a chess position with Stockfish engine
 */
export const EVALUATE_POSITION_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'evaluate_position',
    description:
      'Analyze a chess position with Stockfish engine. Returns evaluation, best move, and principal variation. Use this to verify your analysis or explore alternative lines.',
    parameters: {
      type: 'object',
      properties: {
        fen: {
          type: 'string',
          description: 'FEN notation of the position to analyze',
        },
        depth: {
          type: 'number',
          description: 'Analysis depth (12=quick, 16=standard, 22=deep). Default: 16',
          default: 16,
        },
        multipv: {
          type: 'number',
          description: 'Number of principal variations to return (1-5). Default: 1',
          default: 1,
        },
      },
      required: ['fen'],
    },
  },
};

/**
 * Tool: predict_human_moves
 * Get Maia prediction of what a human would play
 */
export const PREDICT_HUMAN_MOVES_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'predict_human_moves',
    description:
      'Predict what moves a human of a given rating would consider in this position. Uses Maia2 neural network trained on human games. Helpful for understanding if a move was reasonable/expected for the player level.',
    parameters: {
      type: 'object',
      properties: {
        fen: {
          type: 'string',
          description: 'FEN notation of the position',
        },
        rating: {
          type: 'number',
          description: 'Target Elo rating (1100-1900). Default: 1500',
          default: 1500,
        },
      },
      required: ['fen'],
    },
  },
};

/**
 * Tool: lookup_opening
 * Query ECO opening database
 */
export const LOOKUP_OPENING_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'lookup_opening',
    description:
      'Look up opening name, ECO code, and theory for a position or move sequence. Use to identify the opening being played and typical plans.',
    parameters: {
      type: 'object',
      properties: {
        fen: {
          type: 'string',
          description: 'FEN notation of the position to look up',
        },
      },
      required: ['fen'],
    },
  },
};

/**
 * Tool: find_reference_games
 * Search Lichess Elite database for master games
 */
export const FIND_REFERENCE_GAMES_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'find_reference_games',
    description:
      'Find master/elite games that reached this position. Returns games with players, ratings, results, and dates. Useful for understanding how strong players handled this position.',
    parameters: {
      type: 'object',
      properties: {
        fen: {
          type: 'string',
          description: 'FEN notation of the position to search',
        },
        limit: {
          type: 'number',
          description: 'Maximum games to return (1-10). Default: 3',
          default: 3,
        },
      },
      required: ['fen'],
    },
  },
};

/**
 * Tool: make_move
 * Apply a move to get the resulting position
 */
export const MAKE_MOVE_TOOL: OpenAITool = {
  type: 'function',
  function: {
    name: 'make_move',
    description:
      'Apply a move to a position and get the resulting FEN. Use for "what if" analysis - exploring what would happen after a different move. Validates the move is legal.',
    parameters: {
      type: 'object',
      properties: {
        fen: {
          type: 'string',
          description: 'FEN notation of the current position',
        },
        move: {
          type: 'string',
          description: 'Move in SAN (e.g., "Nf3", "e4") or UCI format (e.g., "e2e4", "g1f3")',
        },
      },
      required: ['fen', 'move'],
    },
  },
};

/**
 * All available tools for agentic annotation
 */
export const AGENTIC_TOOLS: OpenAITool[] = [
  EVALUATE_POSITION_TOOL,
  PREDICT_HUMAN_MOVES_TOOL,
  LOOKUP_OPENING_TOOL,
  FIND_REFERENCE_GAMES_TOOL,
  MAKE_MOVE_TOOL,
];

/**
 * Tool names for validation
 */
export const TOOL_NAMES = {
  EVALUATE_POSITION: 'evaluate_position',
  PREDICT_HUMAN_MOVES: 'predict_human_moves',
  LOOKUP_OPENING: 'lookup_opening',
  FIND_REFERENCE_GAMES: 'find_reference_games',
  MAKE_MOVE: 'make_move',
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];
