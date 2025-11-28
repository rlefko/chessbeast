/**
 * Comment generator with degradation levels
 */

import { ResponseCache, generatePositionCacheKey } from '../cache/response-cache.js';
import type { OpenAIClient } from '../client/openai-client.js';
import type { StreamChunk } from '../client/types.js';
import type { LLMConfig } from '../config/llm-config.js';
import { RateLimitError } from '../errors.js';
import type { PlannedAnnotation } from '../planner/annotation-planner.js';
import { CHESS_ANNOTATOR_SYSTEM } from '../prompts/system-prompts.js';
import type { CommentContext } from '../prompts/templates.js';
import { buildCriticalMomentPrompt, buildBriefMovePrompt } from '../prompts/templates.js';
import type { GeneratedComment } from '../validator/output-validator.js';
import { parseJsonResponse, validateComment } from '../validator/output-validator.js';

/**
 * Degradation levels for the comment generator
 */
export enum DegradationLevel {
  /** Full LLM annotation */
  FULL = 0,
  /** LLM with reduced verbosity */
  REDUCED = 1,
  /** LLM only for critical moments */
  CRITICAL_ONLY = 2,
  /** Template-based fallback */
  TEMPLATE = 3,
  /** NAGs only */
  MINIMAL = 4,
}

/**
 * Comment generator with circuit breaker integration
 *
 * IMPORTANT: We do NOT use global degradation that affects all subsequent moves.
 * Each move is evaluated independently. If the LLM fails for one move, we silently
 * skip that move (return empty comment) rather than producing generic fallback text.
 * This prevents a single failure from cascading to ruin all remaining annotations.
 */
export class CommentGenerator {
  private degradationLevel: DegradationLevel = DegradationLevel.FULL;
  private readonly cache: ResponseCache<GeneratedComment>;

  constructor(
    private readonly client: OpenAIClient,
    private readonly config: LLMConfig,
  ) {
    this.cache = new ResponseCache<GeneratedComment>(config.cache);
  }

  /**
   * Get current degradation level
   */
  getDegradationLevel(): DegradationLevel {
    return this.degradationLevel;
  }

  /**
   * Reset degradation level
   */
  resetDegradation(): void {
    this.degradationLevel = DegradationLevel.FULL;
  }

  /**
   * Generate a comment for a single position
   *
   * Each move is evaluated independently. Failures don't cascade to other moves.
   * If we can't generate a good comment, we return empty (let the NAG speak).
   *
   * @param context The comment context with move and position info
   * @param planned The planned annotation with token estimates
   * @param onChunk Optional streaming callback for real-time reasoning display
   */
  async generateComment(
    context: CommentContext,
    planned: PlannedAnnotation,
    onChunk?: (chunk: StreamChunk) => void,
  ): Promise<GeneratedComment> {
    const isCritical = planned.criticalMoment !== undefined;

    // For non-critical moves, skip LLM entirely - NAGs are sufficient
    if (!isCritical && this.degradationLevel >= DegradationLevel.CRITICAL_ONLY) {
      return { comment: undefined, nags: [] };
    }

    // Check cache first
    const cacheKey = generatePositionCacheKey(
      context.move.fenBefore,
      context.targetRating,
      context.verbosity,
    );
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Check if we can afford this request - silently skip if out of budget
    // (don't produce generic fallback, just let the NAG speak for itself)
    if (!this.client.canAfford(planned.estimatedTokens)) {
      const usage = this.client.getTokenUsage();
      console.warn(
        `[LLM] Token budget exhausted: need ~${planned.estimatedTokens}, have ${usage.remaining} remaining (${usage.used} used). Skipping this move.`,
      );
      // Return empty comment - silence is better than generic fallback
      return { comment: undefined, nags: [] };
    }

    try {
      const comment = await this.callLLM(context, onChunk);

      // Cache the result
      this.cache.set(cacheKey, comment);

      return comment;
    } catch (error) {
      return this.handleFailure(error, planned);
    }
  }

  /**
   * Generate comments for a batch of positions
   */
  async generateBatch(
    contexts: Array<{ context: CommentContext; planned: PlannedAnnotation }>,
  ): Promise<GeneratedComment[]> {
    const results: GeneratedComment[] = [];

    for (const { context, planned } of contexts) {
      const comment = await this.generateComment(context, planned);
      results.push(comment);
    }

    return results;
  }

  private async callLLM(
    context: CommentContext,
    onChunk?: (chunk: StreamChunk) => void,
  ): Promise<GeneratedComment> {
    // Choose prompt based on whether it's a critical moment
    const prompt = context.criticalMoment
      ? buildCriticalMomentPrompt(context)
      : buildBriefMovePrompt(context);

    // Build request with optional streaming callback (avoid undefined for exactOptionalPropertyTypes)
    const request: Parameters<typeof this.client.chat>[0] = {
      messages: [
        { role: 'system', content: CHESS_ANNOTATOR_SYSTEM },
        { role: 'user', content: prompt },
      ],
      temperature: this.config.temperature,
      responseFormat: 'json',
      reasoningEffort: this.config.reasoningEffort,
    };
    if (onChunk) {
      request.onChunk = onChunk;
    }

    const response = await this.client.chat(request);

    // Parse and validate response
    const parsed = parseJsonResponse<unknown>(response.content);
    const validation = validateComment(parsed, context.legalMoves);

    if (!validation.valid) {
      // Log issues but use sanitized output
      console.warn('Comment validation issues:', validation.issues);
    }

    return validation.sanitized;
  }

  /**
   * Handle LLM failure for a single move
   *
   * IMPORTANT: We do NOT cascade failures to other moves. If this move fails,
   * we return an empty comment and let the next move try fresh.
   */
  private handleFailure(error: unknown, _planned: PlannedAnnotation): GeneratedComment {
    // Log the error for debugging
    if (error instanceof RateLimitError) {
      console.warn(
        `[LLM] Rate limit error after exhausting all retries. ` +
          `Consider reducing request frequency or upgrading API tier.`,
      );
    } else if (error instanceof Error) {
      console.warn(`[LLM] Comment generation failed: ${error.constructor.name}: ${error.message}`);
    } else {
      console.warn(`[LLM] Comment generation failed with unknown error`);
    }

    // Return empty comment - silence is better than generic fallback
    // This move failed, but don't affect other moves
    return { comment: undefined, nags: [] };
  }
}
