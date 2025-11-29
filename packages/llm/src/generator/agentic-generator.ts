/**
 * Agentic comment generator with tool calling
 */

import type { OpenAIClient } from '../client/openai-client.js';
import type { ChatMessage, StreamChunk, LLMResponse } from '../client/types.js';
import type { LLMConfig } from '../config/llm-config.js';
import type { RichPositionContext } from '../prompts/rich-context.js';
import { formatRichContext } from '../prompts/rich-context.js';
import { AGENTIC_TOOLS, ToolExecutor } from '../tools/index.js';
import type { AgenticServices, AgenticOptions, ToolExecutionStats } from '../tools/types.js';
import type { GeneratedComment } from '../validator/output-validator.js';
import { parseJsonResponse, validateComment } from '../validator/output-validator.js';

/**
 * System prompt for agentic annotation
 */
const AGENTIC_SYSTEM_PROMPT = `Expert chess analyst and teacher. Your annotations must be MAX 2 SENTENCES.

You have access to tools that let you:
1. Analyze positions with Stockfish (various depths)
2. Predict what human players would play (Maia model)
3. Find master games that reached similar positions
4. Explore "what if" variations by making moves

Use these tools when helpful, but don't overuse them.

ABSOLUTE RULES:
- Maximum 2 sentences per annotation
- Never use evaluation numbers or centipawns (+1.5, -0.3, 41cp)
- Never use headers ("Summary:", "Concrete idea:") or bullet lists
- Never say "engine", "Stockfish", "computer analysis"
- Never say "good move" or "mistake" - NAG symbols show this
- Use verbal descriptions: "winning", "clear advantage", "slight edge", "equal"

Good annotations explain:
- WHY a move is good or bad (tactics, strategy, threats)
- Key ideas in simple language appropriate for the target rating

After your analysis, respond with a JSON object:
{
  "comment": "Your 1-2 sentence annotation",
  "nags": []
}

NAG reference:
- 1: Good move (!)
- 2: Mistake (?)
- 3: Brilliant (!!)
- 4: Blunder (??)
- 5: Interesting (!?)
- 6: Dubious (?!)
- 10: = (equal position)
- 14-19: Position assessments`;

/**
 * Progress callback for agentic annotation
 */
export interface AgenticProgress {
  phase: 'analyzing' | 'tool_call' | 'tool_result' | 'finalizing';
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  toolError?: string;
  toolDurationMs?: number;
  iteration: number;
  maxIterations: number;
  thinking?: string;
}

/**
 * Result from agentic annotation
 */
export interface AgenticResult {
  comment: GeneratedComment;
  toolCalls: number;
  iterations: number;
  tokensUsed: number;
}

/**
 * Agentic comment generator that uses tool calling for deeper analysis
 */
export class AgenticCommentGenerator {
  private readonly toolExecutor: ToolExecutor;

  constructor(
    private readonly client: OpenAIClient,
    private readonly config: LLMConfig,
    services: AgenticServices,
    defaultRating?: number,
  ) {
    this.toolExecutor = new ToolExecutor(services, defaultRating);
  }

  /**
   * Generate an agentic comment for a critical position
   *
   * @param context Rich position context with pre-computed analysis
   * @param options Agentic options (max tool calls, etc.)
   * @param onProgress Optional progress callback
   * @param onChunk Optional streaming callback for reasoning
   * @param legalMoves Legal moves in this position (for validation)
   * @param onWarning Optional warning callback (defaults to console.warn)
   */
  async generateComment(
    context: RichPositionContext,
    options: AgenticOptions = {},
    onProgress?: (progress: AgenticProgress) => void,
    onChunk?: (chunk: StreamChunk) => void,
    legalMoves: string[] = [],
    onWarning: (message: string) => void = console.warn,
  ): Promise<AgenticResult> {
    const maxIterations = options.maxToolCalls ?? 5;
    let iteration = 0;
    let totalTokens = 0;

    // Build initial messages
    const messages: ChatMessage[] = [
      { role: 'system', content: AGENTIC_SYSTEM_PROMPT },
      { role: 'user', content: formatRichContext(context) },
    ];

    // Reset tool executor stats
    this.toolExecutor.resetStats();

    // Agentic loop
    while (iteration < maxIterations) {
      iteration++;

      onProgress?.({
        phase: 'analyzing',
        iteration,
        maxIterations,
      });

      // Call LLM with tools
      const response = await this.client.chat({
        messages,
        tools: AGENTIC_TOOLS,
        toolChoice: iteration === maxIterations ? 'none' : 'auto',
        temperature: this.config.temperature,
        reasoningEffort: this.config.reasoningEffort,
        onChunk: (chunk) => {
          // Forward both thinking and content chunks for progress feedback
          if ((chunk.type === 'thinking' || chunk.type === 'content') && onChunk) {
            onChunk(chunk);
          }
          if (chunk.type === 'tool_call') {
            onProgress?.({
              phase: 'tool_call',
              toolName: chunk.text,
              iteration,
              maxIterations,
            });
          }
        },
      });

      totalTokens += response.usage.totalTokens;

      // Check if we got tool calls
      if (!response.toolCalls || response.toolCalls.length === 0) {
        // No tool calls - this is the final response
        onProgress?.({
          phase: 'finalizing',
          iteration,
          maxIterations,
        });

        return this.buildResult(response, legalMoves, totalTokens, iteration, onWarning);
      }

      // Execute tool calls with progress tracking
      const toolResults: Array<{
        toolCallId: string;
        result?: unknown;
        error?: string;
      }> = [];

      for (const toolCall of response.toolCalls) {
        // Parse tool arguments for progress reporting
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        } catch {
          // If parsing fails, use empty object
        }

        // Emit tool_call progress with arguments
        onProgress?.({
          phase: 'tool_call',
          toolName: toolCall.function.name,
          toolArgs,
          iteration,
          maxIterations,
        });

        // Execute individual tool with timing
        const startTime = Date.now();
        const results = await this.toolExecutor.executeAll([toolCall]);
        const durationMs = Date.now() - startTime;
        const result = results[0]!;

        // Emit tool_result progress
        // Build progress object conditionally to satisfy exactOptionalPropertyTypes
        const toolResultProgress: AgenticProgress = {
          phase: 'tool_result',
          toolName: toolCall.function.name,
          toolDurationMs: durationMs,
          iteration,
          maxIterations,
        };
        if (result.result !== undefined) {
          toolResultProgress.toolResult = result.result;
        }
        if (result.error !== undefined) {
          toolResultProgress.toolError = result.error;
        }
        onProgress?.(toolResultProgress);

        toolResults.push(result);
      }

      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: response.content || '',
        toolCalls: response.toolCalls,
      });

      // Add tool results
      for (const result of toolResults) {
        const content = result.error
          ? JSON.stringify({ error: result.error })
          : JSON.stringify(result.result);

        messages.push({
          role: 'tool',
          content,
          toolCallId: result.toolCallId,
        });
      }
    }

    // Max iterations reached without final response
    // Force a final response without tools
    onProgress?.({
      phase: 'finalizing',
      iteration,
      maxIterations,
    });

    // Build final request - conditionally add onChunk to avoid undefined
    const finalRequest: Parameters<typeof this.client.chat>[0] = {
      messages,
      toolChoice: 'none',
      temperature: this.config.temperature,
      reasoningEffort: this.config.reasoningEffort,
    };
    if (onChunk) {
      finalRequest.onChunk = onChunk;
    }

    const finalResponse = await this.client.chat(finalRequest);

    totalTokens += finalResponse.usage.totalTokens;

    return this.buildResult(finalResponse, legalMoves, totalTokens, iteration, onWarning);
  }

  /**
   * Build result from LLM response
   */
  private buildResult(
    response: LLMResponse,
    legalMoves: string[],
    totalTokens: number,
    iterations: number,
    onWarning: (message: string) => void = console.warn,
  ): AgenticResult {
    // Parse and validate response
    const parsed = parseJsonResponse<unknown>(response.content);
    const validation = validateComment(parsed, legalMoves);

    if (!validation.valid) {
      onWarning(`Agentic comment validation issues: ${validation.issues.join(', ')}`);
    }

    return {
      comment: validation.sanitized,
      toolCalls: this.toolExecutor.getToolCallCount(),
      iterations,
      tokensUsed: totalTokens,
    };
  }

  /**
   * Get execution statistics from last run
   */
  getStats(): ToolExecutionStats[] {
    return this.toolExecutor.getStats();
  }
}
