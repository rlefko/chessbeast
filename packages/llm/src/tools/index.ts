/**
 * Agentic tool calling infrastructure
 */

// Types
export type {
  JSONSchema,
  JSONSchemaProperty,
  OpenAIFunction,
  OpenAITool,
  ToolCall,
  ToolResult,
  AgenticServices,
  ToolExecutionStats,
  AgenticOptions,
  // Tool parameter types
  EvaluatePositionParams,
  EvaluatePositionResult,
  PredictHumanMovesParams,
  PredictHumanMovesResult,
  LookupOpeningParams,
  LookupOpeningResult,
  FindReferenceGamesParams,
  FindReferenceGamesResult,
  MakeMoveParams,
  MakeMoveResult,
} from './types.js';

// Definitions
export {
  EVALUATE_POSITION_TOOL,
  PREDICT_HUMAN_MOVES_TOOL,
  LOOKUP_OPENING_TOOL,
  FIND_REFERENCE_GAMES_TOOL,
  MAKE_MOVE_TOOL,
  AGENTIC_TOOLS,
  TOOL_NAMES,
} from './definitions.js';
export type { ToolName } from './definitions.js';

// Executor
export { ToolExecutor } from './executor.js';
