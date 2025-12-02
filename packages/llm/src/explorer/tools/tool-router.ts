/**
 * Tool Router Infrastructure
 *
 * Provides a clean abstraction for routing tool calls to specialized handlers.
 * Each handler is responsible for a group of related tools (SRP).
 */

import type { ToolCall, AgenticServices } from '../../tools/types.js';
import type { AgenticExplorerConfig } from '../agentic-explorer.js';
import type { VariationTree } from '../variation-tree.js';

/**
 * Context passed to tool handlers for each execution
 */
export interface ToolExecutionContext {
  /** The variation tree being manipulated */
  tree: VariationTree;
  /** Number of tool calls used so far */
  toolCallsUsed: number;
  /** Previous position evaluation (for swing detection) */
  previousEval?: number;
  /** Current position evaluation */
  currentEval?: number;
  /** Explorer configuration */
  config: Required<AgenticExplorerConfig>;
  /** Services available for tool execution */
  services: AgenticServices;
  /** Target rating for predictions */
  targetRating: number;
}

/**
 * Interface for specialized tool handlers (ISP)
 *
 * Each handler is responsible for a specific group of related tools,
 * following the Single Responsibility Principle.
 */
export interface ToolHandler {
  /** Tool names this handler can process */
  readonly toolNames: ReadonlyArray<string>;

  /**
   * Execute a tool call
   * @param toolCall The tool call to execute
   * @param args Parsed arguments from the tool call
   * @param context Execution context with tree and services
   * @returns Result of the tool execution
   */
  execute(
    toolCall: ToolCall,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown>;
}

/**
 * Tool Router - dispatches tool calls to appropriate handlers
 *
 * Implements the Strategy pattern to route tools to their handlers.
 */
export class ToolRouter {
  private readonly handlers: Map<string, ToolHandler> = new Map();
  private readonly warnCallback: (message: string) => void;

  constructor(warnCallback?: (message: string) => void) {
    this.warnCallback = warnCallback ?? ((): void => {});
  }

  /**
   * Register a tool handler for its tools
   */
  register(handler: ToolHandler): void {
    for (const toolName of handler.toolNames) {
      if (this.handlers.has(toolName)) {
        this.warnCallback(`Warning: Tool "${toolName}" already registered, overwriting`);
      }
      this.handlers.set(toolName, handler);
    }
  }

  /**
   * Check if a tool is registered
   */
  hasHandler(toolName: string): boolean {
    return this.handlers.has(toolName);
  }

  /**
   * Get all registered tool names
   */
  getRegisteredTools(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Execute a tool call by routing to the appropriate handler
   */
  async execute(toolCall: ToolCall, context: ToolExecutionContext): Promise<unknown> {
    const name = toolCall.function.name;

    const handler = this.handlers.get(name);
    if (!handler) {
      return { success: false, error: `Unknown tool: ${name}` };
    }

    // Parse arguments
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
    } catch (e) {
      this.warnCallback(
        `Failed to parse tool arguments for ${name}: ${toolCall.function.arguments}`,
      );
      args = {};
    }

    return handler.execute(toolCall, args, context);
  }
}
