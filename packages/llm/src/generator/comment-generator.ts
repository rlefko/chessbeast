/**
 * Comment generator with degradation levels
 */

import { ResponseCache, generatePositionCacheKey } from '../cache/response-cache.js';
import type { OpenAIClient } from '../client/openai-client.js';
import type { LLMConfig } from '../config/llm-config.js';
import { RateLimitError } from '../errors.js';
import type { PlannedAnnotation } from '../planner/annotation-planner.js';
import { CHESS_ANNOTATOR_SYSTEM } from '../prompts/system-prompts.js';
import type { CommentContext } from '../prompts/templates.js';
import { buildCriticalMomentPrompt, buildBriefMovePrompt } from '../prompts/templates.js';
import type { GeneratedComment } from '../validator/output-validator.js';
import { parseJsonResponse, validateComment } from '../validator/output-validator.js';

import { generateFallbackComment } from './fallback-generator.js';

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
 * Comment generator with circuit breaker integration and degradation
 */
export class CommentGenerator {
  private degradationLevel: DegradationLevel = DegradationLevel.FULL;
  private consecutiveFailures = 0;
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
    this.consecutiveFailures = 0;
  }

  /**
   * Generate a comment for a single position
   */
  async generateComment(
    context: CommentContext,
    planned: PlannedAnnotation,
  ): Promise<GeneratedComment> {
    const isCritical = planned.criticalMoment !== undefined;

    // Check if we should skip based on degradation
    if (this.shouldSkip(isCritical)) {
      return generateFallbackComment(planned.move, planned.criticalMoment);
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

    // Check if we can afford this request
    if (!this.client.canAfford(planned.estimatedTokens)) {
      const usage = this.client.getTokenUsage();
      console.warn(
        `[LLM] Token budget exhausted: need ~${planned.estimatedTokens}, have ${usage.remaining} remaining (${usage.used} used)`,
      );
      this.increaseDegradation();
      return generateFallbackComment(planned.move, planned.criticalMoment);
    }

    try {
      const comment = await this.callLLM(context);
      this.recordSuccess();

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

  private async callLLM(context: CommentContext): Promise<GeneratedComment> {
    // Choose prompt based on whether it's a critical moment
    const prompt = context.criticalMoment
      ? buildCriticalMomentPrompt(context)
      : buildBriefMovePrompt(context);

    const response = await this.client.chat({
      messages: [
        { role: 'system', content: CHESS_ANNOTATOR_SYSTEM },
        { role: 'user', content: prompt },
      ],
      temperature: this.config.temperature,
      responseFormat: 'json',
    });

    // Parse and validate response
    const parsed = parseJsonResponse<unknown>(response.content);
    const validation = validateComment(parsed, context.legalMoves);

    if (!validation.valid) {
      // Log issues but use sanitized output
      console.warn('Comment validation issues:', validation.issues);
    }

    return validation.sanitized;
  }

  private shouldSkip(isCritical: boolean): boolean {
    switch (this.degradationLevel) {
      case DegradationLevel.CRITICAL_ONLY:
        return !isCritical;
      case DegradationLevel.TEMPLATE:
      case DegradationLevel.MINIMAL:
        return true;
      default:
        return false;
    }
  }

  private handleFailure(error: unknown, planned: PlannedAnnotation): GeneratedComment {
    // Rate limit errors are recoverable - don't increase degradation as aggressively
    // The retry logic should have handled most rate limits, but if we get here
    // it means retries were exhausted
    if (error instanceof RateLimitError) {
      console.warn(
        `[LLM] Rate limit error after exhausting all retries. ` +
          `Consider reducing request frequency or upgrading API tier. ` +
          `Note: This is NOT a token budget issue - the API is throttling requests.`,
      );
      // Only record failure once for rate limits (don't trigger immediate degradation)
      this.consecutiveFailures++;
    } else {
      this.recordFailure();
      // Log the error with more context
      if (error instanceof Error) {
        console.warn(`[LLM] Comment generation failed: ${error.constructor.name}: ${error.message}`);
      } else {
        console.warn(`[LLM] Comment generation failed with unknown error`);
      }
    }

    // Always return a fallback - never throw from public methods
    return generateFallbackComment(planned.move, planned.criticalMoment);
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    // Potentially recover from degradation
    if (this.degradationLevel > DegradationLevel.FULL) {
      this.degradationLevel = Math.max(
        DegradationLevel.FULL,
        this.degradationLevel - 1,
      ) as DegradationLevel;
    }
  }

  private recordFailure(): void {
    this.consecutiveFailures++;

    // Increase degradation after multiple failures
    if (this.consecutiveFailures >= 3 && this.degradationLevel < DegradationLevel.TEMPLATE) {
      this.increaseDegradation();
    }
  }

  private increaseDegradation(): void {
    if (this.degradationLevel < DegradationLevel.MINIMAL) {
      this.degradationLevel++;
    }
  }
}
