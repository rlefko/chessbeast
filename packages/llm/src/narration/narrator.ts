/**
 * Post-Write Narrator
 *
 * Generates natural language comments from comment intents.
 * Coordinates density filtering, redundancy elimination, and
 * LLM-based text generation for final PGN annotations.
 */

import type { OpenAIClient } from '../client/openai-client.js';
import { CircuitOpenError, RateLimitError } from '../errors.js';
import type { LineMemory } from '../memory/line-memory.js';

import type { DensityLevel, DensityConfig } from './density.js';
import { DensityFilter, createDensityFilter, DENSITY_CONFIGS } from './density.js';
import type { CommentIntent, CommentIntentType } from './intents.js';
import { sortIntentsByPriority, getIntentTypeDescription } from './intents.js';
import type { RedundancyFilterConfig } from './redundancy.js';
import { RedundancyFilter, createRedundancyFilter } from './redundancy.js';

/**
 * Audience level for comment style
 */
export type AudienceLevel = 'beginner' | 'club' | 'expert';

/**
 * Narrator configuration
 */
export interface NarratorConfig {
  /** Density level for comment distribution */
  densityLevel: DensityLevel;

  /** Custom density config (overrides densityLevel) */
  customDensityConfig?: DensityConfig;

  /** Redundancy filter config */
  redundancyConfig?: Partial<RedundancyFilterConfig>;

  /** Target audience level */
  audience: AudienceLevel;

  /** Maximum words per comment */
  maxWordsPerComment: number;

  /** Whether to include variations in comments */
  includeVariations: boolean;

  /** Whether to show evaluation numbers */
  showEvaluations: boolean;

  /** Temperature for LLM generation */
  temperature: number;
}

/**
 * Default narrator configuration
 */
export const DEFAULT_NARRATOR_CONFIG: NarratorConfig = {
  densityLevel: 'normal',
  audience: 'club',
  maxWordsPerComment: 50,
  includeVariations: true,
  showEvaluations: false,
  temperature: 0.7,
};

/**
 * Generated comment result
 */
export interface GeneratedNarration {
  /** Ply index */
  plyIndex: number;

  /** The generated comment text */
  comment: string;

  /** Intent type that generated this */
  intentType: CommentIntentType;

  /** Whether this is a brief reference */
  isBriefReference: boolean;

  /** Token usage for this generation */
  tokensUsed?: number;
}

/**
 * Narration result for a full game
 */
export interface NarrationResult {
  /** Generated comments indexed by ply */
  comments: Map<number, GeneratedNarration>;

  /** Statistics */
  stats: {
    totalIntents: number;
    commentsGenerated: number;
    briefReferences: number;
    skippedByDensity: number;
    skippedByRedundancy: number;
    totalTokensUsed: number;
    averageCommentLength: number;
  };

  /** Any warnings during generation */
  warnings: string[];
}

/**
 * Input for narrator processing
 */
export interface NarratorInput {
  /** All comment intents for the game */
  intents: CommentIntent[];

  /** Total plies in the game */
  totalPlies: number;

  /** Line memory for context */
  lineMemory?: LineMemory;

  /** Line ID for redundancy tracking */
  lineId?: string;
}

/**
 * Post-Write Narrator
 *
 * Transforms comment intents into natural language annotations.
 */
export class Narrator {
  private readonly config: NarratorConfig;
  private readonly densityFilter;
  private readonly redundancyFilter;

  constructor(
    private readonly client: OpenAIClient | undefined,
    config: Partial<NarratorConfig> = {},
  ) {
    this.config = { ...DEFAULT_NARRATOR_CONFIG, ...config };

    const densityConfig =
      this.config.customDensityConfig ?? DENSITY_CONFIGS[this.config.densityLevel];
    this.densityFilter = createDensityFilter(densityConfig);
    this.redundancyFilter = createRedundancyFilter(this.config.redundancyConfig);
  }

  /**
   * Generate narration for a game
   */
  async narrate(
    input: NarratorInput,
    onProgress?: (progress: { current: number; total: number; comment?: string }) => void,
    onWarning?: (warning: string) => void,
  ): Promise<NarrationResult> {
    const warnings: string[] = [];
    const warn = onWarning ?? ((msg: string): number => warnings.push(msg));

    // Sort intents by priority
    const sortedIntents = sortIntentsByPriority(input.intents);

    // Apply density filtering
    const densityResult = this.densityFilter.filter(sortedIntents, input.totalPlies);

    // Apply redundancy filtering to included intents
    const redundancyResult = this.redundancyFilter.filter(
      densityResult.includedIntents,
      input.lineId,
    );

    // Combine intents to process
    const intentsToProcess = [
      ...redundancyResult.includedIntents,
      ...redundancyResult.briefReferenceIntents,
    ];

    // Sort by ply for chronological processing
    intentsToProcess.sort((a, b) => a.plyIndex - b.plyIndex);

    // Generate comments
    const comments = new Map<number, GeneratedNarration>();
    let totalTokensUsed = 0;
    let totalCommentLength = 0;

    for (let i = 0; i < intentsToProcess.length; i++) {
      const intent = intentsToProcess[i]!;
      const isBriefReference = redundancyResult.briefReferenceIntents.includes(intent);

      onProgress?.({
        current: i + 1,
        total: intentsToProcess.length,
      });

      try {
        const narration = await this.generateComment(
          intent,
          isBriefReference,
          input.lineMemory,
          warn,
        );

        if (narration.comment.length > 0) {
          comments.set(intent.plyIndex, narration);
          totalTokensUsed += narration.tokensUsed ?? 0;
          totalCommentLength += narration.comment.split(/\s+/).length;

          onProgress?.({
            current: i + 1,
            total: intentsToProcess.length,
            comment: narration.comment,
          });
        }
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          warn('LLM circuit breaker open, using fallback comments');
        } else if (error instanceof RateLimitError) {
          warn('Rate limit reached, using fallback comments');
        } else {
          warn(
            `Comment generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }

        // Use fallback
        const fallback = this.generateFallbackComment(intent, isBriefReference);
        if (fallback.comment.length > 0) {
          comments.set(intent.plyIndex, fallback);
          totalCommentLength += fallback.comment.split(/\s+/).length;
        }
      }
    }

    return {
      comments,
      stats: {
        totalIntents: input.intents.length,
        commentsGenerated: comments.size,
        briefReferences: redundancyResult.briefReferenceIntents.length,
        skippedByDensity: densityResult.stats.filteredCount,
        skippedByRedundancy: redundancyResult.filteredIntents.length,
        totalTokensUsed,
        averageCommentLength: comments.size > 0 ? totalCommentLength / comments.size : 0,
      },
      warnings,
    };
  }

  /**
   * Generate a single comment from an intent
   */
  private async generateComment(
    intent: CommentIntent,
    isBriefReference: boolean,
    lineMemory: LineMemory | undefined,
    onWarning: (warning: string) => void,
  ): Promise<GeneratedNarration> {
    // If no LLM client, use fallback
    if (this.client === undefined) {
      return this.generateFallbackComment(intent, isBriefReference);
    }

    const prompt = this.buildPrompt(intent, isBriefReference, lineMemory);
    const systemPrompt = this.buildSystemPrompt();

    try {
      const response = await this.client.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: this.config.temperature,
      });

      const comment = this.cleanComment(response.content);

      return {
        plyIndex: intent.plyIndex,
        comment,
        intentType: intent.type,
        isBriefReference,
        tokensUsed: response.usage?.totalTokens,
      };
    } catch (error) {
      onWarning(
        `Failed to generate comment: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
      return this.generateFallbackComment(intent, isBriefReference);
    }
  }

  /**
   * Build the system prompt for the narrator
   */
  private buildSystemPrompt(): string {
    const audienceDescriptions: Record<AudienceLevel, string> = {
      beginner: 'a beginner chess player learning the basics',
      club: 'a club-level player familiar with tactics and strategy',
      expert: 'an experienced tournament player',
    };

    return `You are a chess commentator writing annotations for ${audienceDescriptions[this.config.audience]}.

Guidelines:
- Be concise: maximum ${this.config.maxWordsPerComment} words
- Focus on the key idea, not exhaustive analysis
- Use chess notation correctly (e.g., Nf3, O-O, exd5)
- Don't repeat information already obvious from the move
- Write in active voice
- Avoid meta-commentary ("this is interesting", "one might consider")
${this.config.showEvaluations ? '- Include evaluation numbers when relevant' : '- Omit evaluation numbers, focus on concepts'}
${this.config.includeVariations ? '- Reference key variations when they illustrate the point' : '- Avoid detailed variations, focus on concepts'}

Output only the comment text, no formatting or labels.`;
  }

  /**
   * Build the user prompt for a specific intent
   */
  private buildPrompt(
    intent: CommentIntent,
    isBriefReference: boolean,
    lineMemory: LineMemory | undefined,
  ): string {
    const parts: string[] = [];

    // Position context (FEN) - critical for accurate comments
    if (intent.content.fen) {
      parts.push(`Position (FEN): ${intent.content.fen}`);
    }

    // Move context
    const moveColor = intent.content.isWhiteMove ? 'White' : 'Black';
    parts.push(
      `Move: ${intent.content.moveNumber}${intent.content.isWhiteMove ? '.' : '...'} ${intent.content.move} (${moveColor} to move)`,
    );

    // Intent type guidance
    const intentDescription = getIntentTypeDescription(intent.type);
    parts.push(`\nTask: ${intentDescription}`);

    // Add explicit guidance for blunders and mistakes
    if (intent.type === 'blunder_explanation') {
      parts.push(`\n⚠️ CRITICAL: This move (${intent.content.move}) is a BLUNDER.`);
      parts.push(`Your comment MUST explain what's WRONG with this move.`);
      parts.push(
        `Focus on: What threat did Black/White create? What material or position is now lost?`,
      );
      parts.push(`NEVER describe the played move positively - it was a bad move!`);
      if (intent.content.bestAlternative) {
        parts.push(`The correct move was ${intent.content.bestAlternative}.`);
      }
    } else if (intent.type === 'what_was_missed') {
      parts.push(`\nThis move (${intent.content.move}) is a MISTAKE or INACCURACY.`);
      parts.push(`Explain what better option was missed and why the played move is inferior.`);
    }

    // Brief reference instruction
    if (isBriefReference) {
      parts.push('\nNote: Keep this very brief as similar ideas were discussed recently.');
    }

    // Evaluation context
    if (intent.content.evalBefore !== undefined && intent.content.evalAfter !== undefined) {
      const evalBefore = this.formatEval(intent.content.evalBefore);
      const evalAfter = this.formatEval(intent.content.evalAfter);
      parts.push(`\nEvaluation: ${evalBefore} → ${evalAfter}`);

      if (intent.content.winProbDelta !== undefined) {
        const sign = intent.content.winProbDelta > 0 ? '+' : '';
        parts.push(`Win probability change: ${sign}${intent.content.winProbDelta.toFixed(1)}%`);
      }
    }

    // Best alternative
    if (intent.content.bestAlternative !== undefined) {
      parts.push(`\nBetter alternative: ${intent.content.bestAlternative}`);
    }

    // Variation if available
    if (intent.content.variation !== undefined && intent.content.variation.length > 0) {
      const variationStr = intent.content.variation.slice(0, 5).join(' ');
      parts.push(`Key line: ${variationStr}${intent.content.variation.length > 5 ? '...' : ''}`);
    }

    // Theme context
    if (intent.content.themeExplanation !== undefined) {
      parts.push(`\nTheme: ${intent.content.themeExplanation}`);
    }

    // Line memory context
    if (lineMemory !== undefined && lineMemory.narrativeFocus !== undefined) {
      parts.push(`\nCurrent focus: ${lineMemory.narrativeFocus}`);
    }

    // Length guidance (reduced from original for conciseness)
    const lengthGuidance: Record<typeof intent.suggestedLength, string> = {
      brief: '10-20 words',
      standard: '20-35 words',
      detailed: '35-50 words',
    };
    parts.push(`\nTarget length: ${lengthGuidance[intent.suggestedLength]}`);
    parts.push(`Be concise. Do not exceed ${lengthGuidance[intent.suggestedLength]}.`);

    return parts.join('\n');
  }

  /**
   * Generate a fallback comment without LLM
   */
  private generateFallbackComment(
    intent: CommentIntent,
    isBriefReference: boolean,
  ): GeneratedNarration {
    let comment: string;

    if (isBriefReference) {
      // Very brief for references
      comment = this.generateBriefFallback(intent);
    } else {
      // Standard fallback
      comment = this.generateStandardFallback(intent);
    }

    return {
      plyIndex: intent.plyIndex,
      comment,
      intentType: intent.type,
      isBriefReference,
    };
  }

  /**
   * Generate brief fallback comment
   */
  private generateBriefFallback(intent: CommentIntent): string {
    switch (intent.type) {
      case 'blunder_explanation':
        return intent.content.bestAlternative !== undefined
          ? `${intent.content.bestAlternative} was better.`
          : 'A significant mistake.';

      case 'what_was_missed':
        return intent.content.bestAlternative !== undefined
          ? `${intent.content.bestAlternative} was stronger.`
          : 'A better move was available.';

      case 'tactical_shot':
        return 'Tactical opportunity.';

      case 'theme_emergence':
        return intent.content.themeExplanation ?? 'New theme emerges.';

      case 'theme_resolution':
        return 'Theme resolved.';

      case 'critical_moment':
        return 'Critical moment in the game.';

      case 'why_this_move':
        return 'Strong move.';

      case 'strategic_plan':
        return intent.content.themeExplanation ?? 'Strategic idea.';

      case 'endgame_technique':
        return 'Endgame technique.';

      case 'human_move':
        return 'Practical choice.';
    }
  }

  /**
   * Generate standard fallback comment
   */
  private generateStandardFallback(intent: CommentIntent): string {
    const moveStr = `${intent.content.moveNumber}${intent.content.isWhiteMove ? '.' : '...'} ${intent.content.move}`;

    switch (intent.type) {
      case 'blunder_explanation': {
        if (intent.content.bestAlternative !== undefined) {
          const evalDrop =
            intent.content.winProbDelta !== undefined
              ? ` losing ${Math.abs(intent.content.winProbDelta).toFixed(0)}% winning chances`
              : '';
          return `${moveStr} is a mistake${evalDrop}. ${intent.content.bestAlternative} was correct.`;
        }
        return `${moveStr} is a serious error.`;
      }

      case 'what_was_missed': {
        if (intent.content.bestAlternative !== undefined) {
          return `Instead of ${intent.content.move}, ${intent.content.bestAlternative} was stronger.`;
        }
        return `A better continuation was available here.`;
      }

      case 'tactical_shot': {
        if (intent.content.themeExplanation !== undefined) {
          return intent.content.themeExplanation;
        }
        return `${moveStr} creates tactical threats.`;
      }

      case 'theme_emergence': {
        if (intent.content.themeExplanation !== undefined) {
          return intent.content.themeExplanation;
        }
        return `A new strategic theme appears in the position.`;
      }

      case 'theme_resolution': {
        return `The previous theme is now resolved.`;
      }

      case 'critical_moment': {
        const evalContext =
          intent.content.evalBefore !== undefined && intent.content.evalAfter !== undefined
            ? ` (${this.formatEval(intent.content.evalBefore)} → ${this.formatEval(intent.content.evalAfter)})`
            : '';
        return `Critical moment in the game${evalContext}.`;
      }

      case 'why_this_move': {
        if (intent.content.themeExplanation !== undefined) {
          return `${moveStr}: ${intent.content.themeExplanation}`;
        }
        return `${moveStr} is the best move here.`;
      }

      case 'strategic_plan': {
        if (intent.content.themeExplanation !== undefined) {
          return intent.content.themeExplanation;
        }
        return `This continues the strategic plan.`;
      }

      case 'endgame_technique': {
        return `${moveStr} demonstrates proper endgame technique.`;
      }

      case 'human_move': {
        return `${moveStr} is the practical choice here.`;
      }
    }
  }

  /**
   * Format evaluation for display
   */
  private formatEval(cp: number): string {
    if (Math.abs(cp) >= 10000) {
      return cp > 0 ? '+M' : '-M';
    }
    const pawns = cp / 100;
    return pawns >= 0 ? `+${pawns.toFixed(1)}` : pawns.toFixed(1);
  }

  /**
   * Clean up generated comment
   */
  private cleanComment(text: string): string {
    return (
      text
        .trim()
        // Remove quotes
        .replace(/^["']|["']$/g, '')
        // Remove leading/trailing whitespace
        .trim()
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        // Ensure ends with punctuation
        .replace(/([^.!?])$/, '$1.')
    );
  }

  /**
   * Get the redundancy filter for external access
   */
  getRedundancyFilter(): RedundancyFilter {
    return this.redundancyFilter;
  }

  /**
   * Get the density filter for external access
   */
  getDensityFilter(): DensityFilter {
    return this.densityFilter;
  }
}

/**
 * Create a narrator instance
 */
export function createNarrator(
  client: OpenAIClient | undefined,
  config?: Partial<NarratorConfig>,
): Narrator {
  return new Narrator(client, config);
}

/**
 * Quick narration without full narrator setup
 */
export async function narrateIntents(
  intents: CommentIntent[],
  totalPlies: number,
  client?: OpenAIClient,
  config?: Partial<NarratorConfig>,
): Promise<NarrationResult> {
  const narrator = createNarrator(client, config);
  return narrator.narrate({ intents, totalPlies });
}
