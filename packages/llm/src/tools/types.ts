/**
 * Types for agentic tool calling
 */

import type { StockfishClient, MaiaClient } from '@chessbeast/grpc-client';
import type { EcoClient, LichessEliteClient } from '@chessbeast/database';

/**
 * JSON Schema type for OpenAI function parameters
 */
export interface JSONSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  description?: string;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  items?: JSONSchemaProperty;
  enum?: (string | number)[];
}

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  default?: unknown;
  enum?: (string | number)[];
  items?: JSONSchemaProperty;
}

/**
 * OpenAI function definition format
 */
export interface OpenAIFunction {
  name: string;
  description: string;
  parameters: JSONSchema;
}

/**
 * OpenAI tool definition (wrapper around function)
 */
export interface OpenAITool {
  type: 'function';
  function: OpenAIFunction;
}

/**
 * Tool call from LLM response
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/**
 * Tool call result
 */
export interface ToolResult {
  toolCallId: string;
  result: unknown;
  error?: string;
}

/**
 * Services available to tools
 */
export interface AgenticServices {
  stockfish: StockfishClient;
  maia?: MaiaClient;
  eco: EcoClient;
  lichess: LichessEliteClient;
}

/**
 * Tool execution statistics
 */
export interface ToolExecutionStats {
  toolName: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

/**
 * Agentic annotation options
 */
export interface AgenticOptions {
  /** Maximum tool calls per position (default: 5) */
  maxToolCalls?: number;
  /** Enable tools for all moves, not just critical (default: false) */
  enableForAllMoves?: boolean;
  /** Target Elo for Maia predictions */
  targetRating?: number;
}

// ============================================================================
// Tool-specific parameter types
// ============================================================================

/**
 * Parameters for evaluate_position tool
 */
export interface EvaluatePositionParams {
  fen: string;
  depth?: number;
  multipv?: number;
}

/**
 * Result from evaluate_position tool
 */
export interface EvaluatePositionResult {
  evaluation: number; // centipawns
  isMate: boolean;
  mateIn?: number;
  bestMove: string;
  principalVariation: string[];
  depth: number;
  alternatives?: Array<{
    evaluation: number;
    isMate: boolean;
    mateIn?: number;
    principalVariation: string[];
  }>;
}

/**
 * Parameters for predict_human_moves tool
 */
export interface PredictHumanMovesParams {
  fen: string;
  rating?: number;
}

/**
 * Result from predict_human_moves tool
 */
export interface PredictHumanMovesResult {
  predictions: Array<{
    move: string;
    probability: number;
  }>;
  targetRating: number;
}

/**
 * Parameters for lookup_opening tool
 */
export interface LookupOpeningParams {
  fen: string;
}

/**
 * Result from lookup_opening tool
 */
export interface LookupOpeningResult {
  found: boolean;
  eco?: string;
  name?: string;
  mainLine?: string[];
  isExactMatch?: boolean;
  matchedPlies?: number;
}

/**
 * Parameters for find_reference_games tool
 */
export interface FindReferenceGamesParams {
  fen: string;
  limit?: number;
}

/**
 * Result from find_reference_games tool
 */
export interface FindReferenceGamesResult {
  games: Array<{
    white: string;
    black: string;
    result: string;
    whiteElo?: number;
    blackElo?: number;
    date?: string;
    event?: string;
    eco?: string;
  }>;
  totalCount: number;
}

/**
 * Parameters for make_move tool
 */
export interface MakeMoveParams {
  fen: string;
  move: string;
}

/**
 * Result from make_move tool
 */
export interface MakeMoveResult {
  success: boolean;
  fenAfter?: string;
  sanMove?: string;
  error?: string;
  isCheck?: boolean;
  isCheckmate?: boolean;
  isStalemate?: boolean;
}
