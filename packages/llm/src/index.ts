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
import type { HealthStatus, StreamChunk } from './client/types.js';
import type { LLMConfig } from './config/llm-config.js';
import { createLLMConfig, loadConfigFromEnv } from './config/llm-config.js';
import {
  VariationExplorer,
  createVariationExplorer,
  type EngineService,
  type MaiaService,
} from './explorer/index.js';
import { CommentGenerator, DegradationLevel } from './generator/comment-generator.js';
import { SummaryGenerator, formatSummaryAsString } from './generator/summary-generator.js';
import {
  createAnnotationPlan,
  buildCommentContext,
  type PlanOptions,
} from './planner/annotation-planner.js';
import type { PlannedVariation } from './prompts/templates.js';

/**
 * Progress information during annotation
 */
export interface AnnotationProgress {
  /** Current phase of annotation */
  phase: 'exploring' | 'annotating' | 'summarizing';
  /** Current move being analyzed (e.g., "14... Be6") */
  currentMove?: string;
  /** Index of current position in plan (0-based) */
  currentIndex: number;
  /** Total number of positions to annotate */
  totalPositions: number;
  /** Current reasoning/thinking chunk (if streaming) */
  thinking?: string;
}

/**
 * Options for annotation
 */
export interface AnnotationOptions extends PlanOptions {
  /** Whether to generate a game summary (default: true) */
  generateSummary?: boolean;
  /** Skip annotation entirely if circuit breaker is open (default: false) */
  skipOnCircuitOpen?: boolean;
  /** Progress callback for real-time status updates */
  onProgress?: (progress: AnnotationProgress) => void;
  /** Warning callback for non-fatal issues (default: console.warn) */
  onWarning?: (message: string) => void;
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
 * Services for variation exploration
 */
export interface AnnotatorServices {
  /** Engine service for position evaluation */
  engine?: EngineService;
  /** Maia service for human-like move prediction */
  maia?: MaiaService;
}

/**
 * Main annotator class - orchestrates the annotation pipeline
 */
export class Annotator {
  private readonly client: OpenAIClient;
  private readonly config: LLMConfig;
  private readonly commentGenerator: CommentGenerator;
  private readonly summaryGenerator: SummaryGenerator;
  private readonly variationExplorer?: VariationExplorer;

  /**
   * Create a new annotator
   * @param config Configuration (apiKey required, others have defaults)
   * @param services Optional services for variation exploration
   */
  constructor(config: Partial<LLMConfig> & { apiKey: string }, services?: AnnotatorServices) {
    this.config = createLLMConfig(config);
    this.client = new OpenAIClient(this.config);
    this.commentGenerator = new CommentGenerator(this.client, this.config);
    this.summaryGenerator = new SummaryGenerator(this.client, this.config);

    // Create variation explorer if engine service is provided
    if (services?.engine) {
      this.variationExplorer = createVariationExplorer(
        services.engine,
        services.maia,
        this.client,
        this.config,
      );
    }
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
    const {
      generateSummary = true,
      skipOnCircuitOpen = false,
      onProgress,
      onWarning = (msg: string): void => console.warn(msg),
      ...planOptions
    } = options;

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

    // Explore variations for critical moments
    if (this.variationExplorer) {
      // Count critical positions for progress tracking
      const criticalPositions = plan.positions.filter((p) => p.criticalMoment);
      let explorationIndex = 0;

      for (const planned of plan.positions) {
        if (planned.criticalMoment) {
          // Format move notation for progress display
          const moveNotation = `${planned.move.moveNumber}${planned.move.isWhiteMove ? '.' : '...'} ${planned.move.san}`;

          // Report exploration progress
          onProgress?.({
            phase: 'exploring',
            currentMove: moveNotation,
            currentIndex: explorationIndex,
            totalPositions: criticalPositions.length,
          });

          try {
            const exploredLines = await this.variationExplorer.explorePosition(
              planned.move.fenBefore,
              plan.targetRating,
              planned.move.san,
            );

            // Store explored variations on the move for PGN rendering
            const move = analysis.moves[planned.plyIndex];
            if (move && exploredLines.length > 0) {
              move.exploredVariations = exploredLines.map((line) => ({
                moves: line.moves,
                annotations: Object.fromEntries(line.annotations),
                purpose: line.purpose,
                source: line.source,
                // Include finalEval for position NAG at end of variation
                finalEval: line.finalEval
                  ? {
                      cp: line.finalEval.cp,
                      mate: line.finalEval.mate,
                      depth: line.finalEval.depth,
                      pv: line.finalEval.pv,
                    }
                  : undefined,
              }));
            }
          } catch (error) {
            // Log but continue - exploration is optional enhancement
            const errMsg = error instanceof Error ? error.message : String(error);
            onWarning(`Variation exploration failed for ply ${planned.plyIndex}: ${errMsg}`);
          }
          explorationIndex++;
        }
      }
    }

    // Generate comments for each planned position
    let positionsAnnotated = 0;
    for (let i = 0; i < plan.positions.length; i++) {
      const planned = plan.positions[i]!;
      // Get legal moves for validation (placeholder - would need chess library)
      const legalMoves = this.getLegalMoves(planned.move.fenBefore);

      // Get explored variations if available (for coherent commentary)
      // This allows the LLM to know what variations will appear in PGN output
      const move = analysis.moves[planned.plyIndex];
      const exploredVariations: PlannedVariation[] | undefined = move?.exploredVariations?.map(
        (v) => ({
          moves: v.moves,
          purpose: v.purpose as 'best' | 'human_alternative' | 'refutation' | 'trap' | 'thematic',
          source: v.source as 'engine' | 'maia' | 'llm',
        }),
      );

      // Build context with perspective, NAG awareness, and explored variations
      const context = buildCommentContext(
        planned,
        plan.targetRating,
        legalMoves,
        plan.openingName,
        perspective,
        includeNags,
        exploredVariations,
      );

      // Format move notation for progress
      const moveNotation = `${planned.move.moveNumber}${planned.move.isWhiteMove ? '.' : '...'} ${planned.move.san}`;

      // Report progress - starting this move
      onProgress?.({
        phase: 'annotating',
        currentMove: moveNotation,
        currentIndex: i,
        totalPositions: plan.positions.length,
      });

      // Create streaming callback that forwards chunks to progress
      // Forward both thinking and content chunks so the progress timer stays alive
      const onChunk: ((chunk: StreamChunk) => void) | undefined = onProgress
        ? (chunk: StreamChunk): void => {
            if (chunk.type === 'thinking') {
              onProgress({
                phase: 'annotating',
                currentMove: moveNotation,
                currentIndex: i,
                totalPositions: plan.positions.length,
                thinking: chunk.text,
              });
            } else if (chunk.type === 'content') {
              // Forward content chunks with text so displayThinking() is called
              onProgress({
                phase: 'annotating',
                currentMove: moveNotation,
                currentIndex: i,
                totalPositions: plan.positions.length,
                thinking: chunk.text,
              });
            }
          }
        : undefined;

      // Generate comment
      const comment = await this.commentGenerator.generateComment(
        context,
        planned,
        onChunk,
        onWarning,
      );

      // Apply to analysis
      if (move && comment.comment) {
        move.comment = comment.comment;
        positionsAnnotated++;
      }
    }

    // Generate game summary
    let summaryGenerated = false;
    if (generateSummary && plan.generateSummary) {
      // Report progress - starting summary
      onProgress?.({
        phase: 'summarizing',
        currentIndex: plan.positions.length,
        totalPositions: plan.positions.length,
      });

      const summary = await this.summaryGenerator.generateSummary(
        analysis,
        plan.targetRating,
        onWarning,
      );
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
export type {
  LLMConfig,
  TokenBudget,
  RetryConfig,
  CacheConfig,
  ReasoningEffort,
} from './config/llm-config.js';
export { createLLMConfig, loadConfigFromEnv, DEFAULT_LLM_CONFIG } from './config/llm-config.js';

export type { HealthStatus, TokenUsage, CircuitState, StreamChunk } from './client/types.js';
export { OpenAIClient, TokenTracker } from './client/openai-client.js';
export { CircuitBreaker } from './client/circuit-breaker.js';

export type { VerbosityLevel, CommentContext } from './prompts/templates.js';
export { buildCriticalMomentPrompt, buildSummaryPrompt } from './prompts/templates.js';
export { CHESS_ANNOTATOR_SYSTEM, GAME_SUMMARY_SYSTEM } from './prompts/system-prompts.js';

export type {
  AnnotationPlan,
  PlannedAnnotation,
  PlanOptions,
  AnalysisDepth,
} from './planner/annotation-planner.js';
export {
  createAnnotationPlan,
  buildCommentContext,
  getAnalysisDepth,
} from './planner/annotation-planner.js';
export { calculateVerbosity, shouldAnnotate, WORD_LIMITS } from './planner/verbosity.js';

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
  CommentValidationContext,
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

// Variation exploration
export {
  VariationExplorer,
  createVariationExplorer,
  type ExploredLine,
  type ExplorationSession,
  type ExplorationConfig,
  type LinePurpose,
  type LineSource,
  type EngineService,
  type MaiaService,
} from './explorer/index.js';

// Agentic annotation
export {
  AgenticCommentGenerator,
  type AgenticProgress,
  type AgenticResult,
} from './generator/agentic-generator.js';

export {
  formatRichContext,
  buildRichContext,
  type RichPositionContext,
  type DeepAnalysis,
} from './prompts/rich-context.js';

// Tools
export {
  ToolExecutor,
  AGENTIC_TOOLS,
  TOOL_NAMES,
  type ToolName,
  type AgenticServices,
  type AgenticOptions,
  type ToolCall,
  type ToolResult,
  type ToolExecutionStats,
  type OpenAITool,
} from './tools/index.js';

// Cost tracking
export {
  CostTracker,
  formatCost,
  formatTokens,
  formatCostStats,
  getModelPricing,
  calculateCost,
  MODEL_PRICING,
  DEFAULT_PRICING,
  type ModelPricing,
  type CostBreakdown,
  type CostStats,
  type FormatOptions,
} from './cost/index.js';
