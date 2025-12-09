/**
 * Post-Write Annotation Pipeline
 *
 * Orchestrates post-write annotation after engine-driven exploration.
 * Coordinates between:
 * - Comment intent generation
 * - Density filtering
 * - Redundancy detection
 * - LLM narration
 *
 * This is the main integration point for the Ultra-Fast Coach
 * architecture's annotation phase.
 */

import type { ArtifactCache, VariationDAG } from '@chessbeast/core';

import type { OpenAIClient } from '../client/openai-client.js';
import type { LineMemory, LineMemoryConfig } from '../memory/line-memory.js';
import {
  createLineMemory,
  addSummaryEntry,
  DEFAULT_LINE_MEMORY_CONFIG,
} from '../memory/line-memory.js';
import type { CommentIntent, DensityLevel, NarratorConfig } from '../narration/index.js';
import { Narrator, createNarrator, DensityFilter, createDensityFilter, DENSITY_CONFIGS } from '../narration/index.js';
import type { ThemeInstance, ThemeSummary } from '../themes/types.js';

/**
 * Configuration for the post-write pipeline
 */
export interface PostWritePipelineConfig {
  /** Narrator configuration */
  narrator: Partial<NarratorConfig>;

  /** Density level for comment distribution */
  density: DensityLevel;

  /** Line memory configuration */
  lineMemory: Partial<LineMemoryConfig>;

  /** Maximum comments per game */
  maxCommentsPerGame?: number;

  /** Whether to use LLM for comment generation */
  useLlm: boolean;
}

/**
 * Default pipeline configuration
 */
const DEFAULT_CONFIG: PostWritePipelineConfig = {
  narrator: {
    audience: 'club',
    maxWordsPerComment: 50,
    includeVariations: true,
    showEvaluations: false,
  },
  density: 'normal',
  lineMemory: {},
  maxCommentsPerGame: 30,
  useLlm: true,
};

/**
 * Progress callback information
 */
export interface PostWritePipelineProgress {
  /** Current phase */
  phase: 'filtering' | 'narrating' | 'complete';

  /** Number of intents processed */
  intentsProcessed: number;

  /** Total intents to process */
  totalIntents: number;

  /** Number of comments generated */
  commentsGenerated: number;

  /** Current comment being generated */
  currentComment?: string;
}

/**
 * Input for the post-write pipeline
 */
export interface PostWritePipelineInput {
  /** Comment intents from exploration */
  intents: CommentIntent[];

  /** Total plies in the game */
  totalPlies: number;

  /** Variation DAG (optional, for context) */
  dag?: VariationDAG;

  /** Artifact cache (optional, for evaluation context) */
  cache?: ArtifactCache;

  /** Theme summaries by position key */
  themeSummaries?: Map<string, ThemeSummary>;

  /** All detected themes by position key */
  themes?: Map<string, ThemeInstance[]>;
}

/**
 * Result from the post-write pipeline
 */
export interface PostWritePipelineResult {
  /** Generated comments indexed by ply */
  comments: Map<number, string>;

  /** NAGs indexed by ply */
  nags: Map<number, string[]>;

  /** Statistics */
  stats: {
    totalIntents: number;
    intentsAfterDensity: number;
    intentsAfterRedundancy: number;
    commentsGenerated: number;
    tokensUsed: number;
    averageCommentLength: number;
  };

  /** Warnings during processing */
  warnings: string[];

  /** Line memory state at end */
  lineMemory?: LineMemory;
}

/**
 * Post-Write Annotation Pipeline
 *
 * Transforms comment intents into PGN annotations.
 */
export class PostWritePipeline {
  private readonly config: PostWritePipelineConfig;
  private readonly narrator: Narrator;
  private readonly densityFilter: DensityFilter;
  private readonly lineMemoryConfig: LineMemoryConfig;
  private lineMemory: LineMemory | undefined;

  constructor(
    client: OpenAIClient | undefined,
    config: Partial<PostWritePipelineConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Merge line memory config
    this.lineMemoryConfig = { ...DEFAULT_LINE_MEMORY_CONFIG, ...this.config.lineMemory };

    // Create narrator with merged config
    this.narrator = createNarrator(
      this.config.useLlm ? client : undefined,
      {
        densityLevel: this.config.density,
        ...this.config.narrator,
      },
    );

    // Create density filter
    this.densityFilter = createDensityFilter(DENSITY_CONFIGS[this.config.density]);
  }

  /**
   * Run the post-write annotation pipeline
   */
  async annotate(
    input: PostWritePipelineInput,
    onProgress?: (progress: PostWritePipelineProgress) => void,
    onWarning?: (warning: string) => void,
  ): Promise<PostWritePipelineResult> {
    const warnings: string[] = [];
    const warn = onWarning ?? ((msg: string) => warnings.push(msg));

    // Phase 1: Density filtering
    onProgress?.({
      phase: 'filtering',
      intentsProcessed: 0,
      totalIntents: input.intents.length,
      commentsGenerated: 0,
    });

    const densityResult = this.densityFilter.filter(input.intents, input.totalPlies);

    // Apply max comments limit if needed
    let filteredIntents = densityResult.includedIntents;
    if (this.config.maxCommentsPerGame && filteredIntents.length > this.config.maxCommentsPerGame) {
      // Keep mandatory intents and top-priority others
      const mandatory = filteredIntents.filter((i) => i.mandatory);
      const optional = filteredIntents
        .filter((i) => !i.mandatory)
        .sort((a, b) => b.priority - a.priority);

      const remainingSlots = Math.max(0, this.config.maxCommentsPerGame - mandatory.length);
      filteredIntents = [...mandatory, ...optional.slice(0, remainingSlots)];
    }

    onProgress?.({
      phase: 'filtering',
      intentsProcessed: input.intents.length,
      totalIntents: input.intents.length,
      commentsGenerated: 0,
    });

    // Phase 2: Initialize line memory with theme context
    const lineId = `game-${Date.now()}`;
    this.lineMemory = createLineMemory(lineId, 'startpos', 'root');

    // Add theme context to line memory if available
    if (input.themeSummaries) {
      for (const [_posKey, summary] of input.themeSummaries) {
        for (const theme of summary.emerged) {
          addSummaryEntry(
            this.lineMemory,
            {
              text: `${theme.type}: ${theme.explanation}`,
              type: 'theme_emerged',
              priority: theme.severity === 'critical' ? 10 : theme.severity === 'significant' ? 7 : 5,
            },
            this.lineMemoryConfig,
          );
        }
      }
    }

    // Phase 3: Generate narration
    onProgress?.({
      phase: 'narrating',
      intentsProcessed: 0,
      totalIntents: filteredIntents.length,
      commentsGenerated: 0,
    });

    const lineMemory = this.lineMemory;
    const narrationResult = await this.narrator.narrate(
      {
        intents: filteredIntents,
        totalPlies: input.totalPlies,
        lineMemory,
        lineId,
      },
      (progress) => {
        const progressUpdate: PostWritePipelineProgress = {
          phase: 'narrating',
          intentsProcessed: progress.current,
          totalIntents: progress.total,
          commentsGenerated: progress.current,
        };
        if (progress.comment !== undefined) {
          progressUpdate.currentComment = progress.comment;
        }
        onProgress?.(progressUpdate);
      },
      warn,
    );

    // Extract comments and NAGs
    const comments = new Map<number, string>();
    const nags = new Map<number, string[]>();

    for (const [plyIndex, narration] of narrationResult.comments) {
      comments.set(plyIndex, narration.comment);

      // Generate NAGs based on intent type
      const intentNags = this.generateNagsForIntent(
        filteredIntents.find((i) => i.plyIndex === plyIndex),
      );
      if (intentNags.length > 0) {
        nags.set(plyIndex, intentNags);
      }
    }

    // Complete
    onProgress?.({
      phase: 'complete',
      intentsProcessed: filteredIntents.length,
      totalIntents: filteredIntents.length,
      commentsGenerated: comments.size,
    });

    return {
      comments,
      nags,
      stats: {
        totalIntents: input.intents.length,
        intentsAfterDensity: densityResult.includedIntents.length,
        intentsAfterRedundancy: filteredIntents.length,
        commentsGenerated: narrationResult.stats.commentsGenerated,
        tokensUsed: narrationResult.stats.totalTokensUsed,
        averageCommentLength: narrationResult.stats.averageCommentLength,
      },
      warnings: [...warnings, ...narrationResult.warnings],
      lineMemory: this.lineMemory,
    };
  }

  /**
   * Generate NAGs based on intent type
   */
  private generateNagsForIntent(intent?: CommentIntent): string[] {
    if (!intent) return [];

    const nags: string[] = [];

    switch (intent.type) {
      case 'blunder_explanation':
        nags.push('$4'); // Blunder
        break;
      case 'what_was_missed':
        if (intent.content.winProbDelta !== undefined) {
          if (Math.abs(intent.content.winProbDelta) >= 15) {
            nags.push('$2'); // Mistake
          } else {
            nags.push('$6'); // Inaccuracy
          }
        }
        break;
      case 'tactical_shot':
        nags.push('$1'); // Good move
        break;
      case 'why_this_move':
        nags.push('$1'); // Good move
        break;
      case 'critical_moment':
        // Position NAG - use sparingly
        break;
    }

    return nags;
  }

  /**
   * Get the narrator for direct access
   */
  getNarrator(): Narrator {
    return this.narrator;
  }

  /**
   * Get the density filter for direct access
   */
  getDensityFilter(): DensityFilter {
    return this.densityFilter;
  }

  /**
   * Get the current line memory (may be undefined before first annotate call)
   */
  getLineMemory(): LineMemory | undefined {
    return this.lineMemory;
  }
}

/**
 * Create a post-write pipeline
 */
export function createPostWritePipeline(
  client: OpenAIClient | undefined,
  config?: Partial<PostWritePipelineConfig>,
): PostWritePipeline {
  return new PostWritePipeline(client, config);
}

/**
 * Quick annotation without full pipeline setup
 */
export async function annotateWithPostWrite(
  intents: CommentIntent[],
  totalPlies: number,
  client?: OpenAIClient,
  config?: Partial<PostWritePipelineConfig>,
): Promise<PostWritePipelineResult> {
  const pipeline = createPostWritePipeline(client, config);
  return pipeline.annotate({ intents, totalPlies });
}
