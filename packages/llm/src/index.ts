/**
 * @chessbeast/llm - LLM annotation generation for chess games
 *
 * This package provides AI-powered annotation generation using OpenAI's GPT models.
 * It includes:
 * - OpenAI client with retry logic and circuit breaker
 * - Token budget management with adaptive verbosity
 * - Prompt templates for chess annotation
 * - Output validation for NAGs and move references
 * - LRU caching for responses
 * - Graceful degradation with template-based fallbacks
 */

import type { GameAnalysis } from '@chessbeast/core';

import { OpenAIClient } from './client/openai-client.js';
import type { HealthStatus } from './client/types.js';
import type { LLMConfig } from './config/llm-config.js';
import { createLLMConfig, loadConfigFromEnv } from './config/llm-config.js';
import { CommentGenerator, DegradationLevel } from './generator/comment-generator.js';
import { SummaryGenerator, formatSummaryAsString } from './generator/summary-generator.js';
import {
  createAnnotationPlan,
  buildCommentContext,
  type PlanOptions,
} from './planner/annotation-planner.js';

/**
 * Options for annotation
 */
export interface AnnotationOptions extends PlanOptions {
  /** Whether to generate a game summary (default: true) */
  generateSummary?: boolean;
  /** Skip annotation entirely if circuit breaker is open (default: false) */
  skipOnCircuitOpen?: boolean;
}

/**
 * Result of annotation
 */
export interface AnnotationResult {
  /** The annotated game analysis */
  analysis: GameAnalysis;
  /** Token usage statistics */
  tokenUsage: { used: number; remaining: number };
  /** Number of positions annotated */
  positionsAnnotated: number;
  /** Whether summary was generated */
  summaryGenerated: boolean;
  /** Current degradation level */
  degradationLevel: DegradationLevel;
}

/**
 * Main annotator class - orchestrates the annotation pipeline
 */
export class Annotator {
  private readonly client: OpenAIClient;
  private readonly config: LLMConfig;
  private readonly commentGenerator: CommentGenerator;
  private readonly summaryGenerator: SummaryGenerator;

  /**
   * Create a new annotator
   * @param config Configuration (apiKey required, others have defaults)
   */
  constructor(config: Partial<LLMConfig> & { apiKey: string }) {
    this.config = createLLMConfig(config);
    this.client = new OpenAIClient(this.config);
    this.commentGenerator = new CommentGenerator(this.client, this.config);
    this.summaryGenerator = new SummaryGenerator(this.client, this.config);
  }

  /**
   * Create an annotator from environment variables
   * Requires OPENAI_API_KEY to be set
   */
  static fromEnv(): Annotator {
    const envConfig = loadConfigFromEnv();
    if (!envConfig.apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    return new Annotator(envConfig as Partial<LLMConfig> & { apiKey: string });
  }

  /**
   * Annotate a game analysis with LLM-generated comments
   * @param analysis The analyzed game to annotate
   * @param options Annotation options
   * @returns The annotated analysis and statistics
   */
  async annotate(
    analysis: GameAnalysis,
    options: AnnotationOptions = {},
  ): Promise<AnnotationResult> {
    const { generateSummary = true, skipOnCircuitOpen = false, ...planOptions } = options;

    // Reset client for new game
    this.client.resetForNewGame();
    this.commentGenerator.resetDegradation();

    // Check circuit breaker
    if (skipOnCircuitOpen && this.client.getCircuitState() === 'open') {
      return {
        analysis,
        tokenUsage: this.client.getTokenUsage(),
        positionsAnnotated: 0,
        summaryGenerated: false,
        degradationLevel: DegradationLevel.TEMPLATE,
      };
    }

    // Create annotation plan
    const plan = createAnnotationPlan(analysis, this.config.budget, planOptions);

    // Get perspective and includeNags from options
    const perspective = planOptions.perspective ?? 'neutral';
    const includeNags = planOptions.includeNags ?? true;

    // Generate comments for each planned position
    let positionsAnnotated = 0;
    for (const planned of plan.positions) {
      // Get legal moves for validation (placeholder - would need chess library)
      const legalMoves = this.getLegalMoves(planned.move.fenBefore);

      // Build context with perspective and NAG awareness
      const context = buildCommentContext(
        planned,
        plan.targetRating,
        legalMoves,
        plan.openingName,
        perspective,
        includeNags,
      );

      // Generate comment
      const comment = await this.commentGenerator.generateComment(context, planned);

      // Apply to analysis
      const move = analysis.moves[planned.plyIndex];
      if (move && comment.comment) {
        move.comment = comment.comment;
        positionsAnnotated++;
      }
    }

    // Generate game summary
    let summaryGenerated = false;
    if (generateSummary && plan.generateSummary) {
      const summary = await this.summaryGenerator.generateSummary(analysis, plan.targetRating);
      analysis.summary = formatSummaryAsString(summary);
      summaryGenerated = true;
    }

    return {
      analysis,
      tokenUsage: this.client.getTokenUsage(),
      positionsAnnotated,
      summaryGenerated,
      degradationLevel: this.commentGenerator.getDegradationLevel(),
    };
  }

  /**
   * Get health status of the annotator
   */
  getHealthStatus(): HealthStatus {
    return this.client.getHealthStatus();
  }

  /**
   * Get token usage statistics
   */
  getTokenUsage(): { used: number; remaining: number } {
    return this.client.getTokenUsage();
  }

  /**
   * Get current degradation level
   */
  getDegradationLevel(): DegradationLevel {
    return this.commentGenerator.getDegradationLevel();
  }

  /**
   * Get legal moves for a position
   * TODO: Integrate with chess library for actual move generation
   */
  private getLegalMoves(_fen: string): string[] {
    // Placeholder - in production would use chess.js or similar
    // For now, return empty array which disables move validation
    return [];
  }
}

// Re-export types and utilities
export type { LLMConfig, TokenBudget, RetryConfig, CacheConfig } from './config/llm-config.js';
export { createLLMConfig, loadConfigFromEnv, DEFAULT_LLM_CONFIG } from './config/llm-config.js';

export type { HealthStatus, TokenUsage, CircuitState } from './client/types.js';
export { OpenAIClient, TokenTracker } from './client/openai-client.js';
export { CircuitBreaker } from './client/circuit-breaker.js';

export type { VerbosityLevel, CommentContext } from './prompts/templates.js';
export { buildCriticalMomentPrompt, buildSummaryPrompt } from './prompts/templates.js';
export { CHESS_ANNOTATOR_SYSTEM, GAME_SUMMARY_SYSTEM } from './prompts/system-prompts.js';

export type {
  AnnotationPlan,
  PlannedAnnotation,
  PlanOptions,
} from './planner/annotation-planner.js';
export { createAnnotationPlan, buildCommentContext } from './planner/annotation-planner.js';
export { calculateVerbosity, shouldAnnotate } from './planner/verbosity.js';

export { CommentGenerator, DegradationLevel } from './generator/comment-generator.js';
export { SummaryGenerator, formatSummaryAsString } from './generator/summary-generator.js';
export {
  generateFallbackComment,
  generateFallbackSummary,
} from './generator/fallback-generator.js';

export type {
  GeneratedComment,
  GeneratedSummary,
  ValidationResult,
} from './validator/output-validator.js';
export {
  validateComment,
  validateSummary,
  parseJsonResponse,
  extractMentionedMoves,
} from './validator/output-validator.js';
export { isValidNag, classificationToNag, filterValidNags } from './validator/nag-validator.js';
export { validateMoveReferences, extractMoveReferences } from './validator/move-validator.js';

export {
  ResponseCache,
  generatePositionCacheKey,
  generateOpeningCacheKey,
} from './cache/response-cache.js';

export * from './errors.js';
