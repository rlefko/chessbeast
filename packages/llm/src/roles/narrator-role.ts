/**
 * Narrator Role
 *
 * LLM role for post-write comment generation.
 * Takes a comment intent and agent card, produces natural language annotation.
 */

import type { NarratorRoleInput, NarratorRoleResult } from '../agent-cards/types.js';
import type { OpenAIClient } from '../client/openai-client.js';
import { CircuitOpenError, RateLimitError } from '../errors.js';
import type { CommentIntent } from '../narration/intents.js';
import { getIntentTypeDescription } from '../narration/intents.js';

import type { RoleConfig, CommentStyle, AudienceLevel, RoleError } from './types.js';
import { AUDIENCE_DESCRIPTIONS, STYLE_DESCRIPTIONS, getRoleConfig } from './types.js';

/**
 * Narrator role configuration
 */
export interface NarratorRoleConfig {
  /** Base role config overrides */
  roleConfig?: Partial<RoleConfig>;

  /** Default audience level */
  defaultAudience: AudienceLevel;

  /** Default comment style */
  defaultStyle: CommentStyle;

  /** Whether to show evaluation numbers */
  showEvaluations: boolean;

  /** Whether to include variation references */
  includeVariations: boolean;
}

/**
 * Default narrator role configuration
 */
export const DEFAULT_NARRATOR_ROLE_CONFIG: NarratorRoleConfig = {
  defaultAudience: 'club',
  defaultStyle: 'concise',
  showEvaluations: false,
  includeVariations: true,
};

/**
 * Narrator Role
 *
 * Generates natural language comments from structured intents.
 */
export class NarratorRole {
  private readonly config: NarratorRoleConfig;
  private readonly roleConfig: RoleConfig;

  constructor(
    private readonly client: OpenAIClient | undefined,
    config: Partial<NarratorRoleConfig> = {},
  ) {
    this.config = { ...DEFAULT_NARRATOR_ROLE_CONFIG, ...config };
    this.roleConfig = getRoleConfig('narrator', config.roleConfig);
  }

  /**
   * Generate a comment from an intent and agent card
   */
  async generate(input: NarratorRoleInput): Promise<NarratorRoleResult | RoleError> {
    // If no client, use fallback
    if (this.client === undefined) {
      return this.generateFallback(input.intent, input.style);
    }

    const prompt = this.buildPrompt(input);
    const systemPrompt = this.buildSystemPrompt(input.card.constraints.audience, input.style);

    try {
      const response = await this.client.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: this.roleConfig.temperature,
      });

      const comment = this.cleanComment(response.content);
      const tokensUsed = response.usage?.totalTokens ?? 0;

      return {
        comment,
        tokensUsed,
        confidence: this.estimateConfidence(comment, input),
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Build the system prompt
   */
  private buildSystemPrompt(audience: AudienceLevel, style: CommentStyle): string {
    const audienceDesc = AUDIENCE_DESCRIPTIONS[audience];
    const styleDesc = STYLE_DESCRIPTIONS[style];

    return `You are a chess commentator writing annotations for ${audienceDesc}.

Style: ${styleDesc}

CRITICAL LENGTH REQUIREMENTS:
- Maximum 100 characters for standard comments
- Maximum 150 characters for detailed explanations
- Prefer brevity - say more with less

Guidelines:
- Write clear, instructive comments focused on the key idea
- Use standard algebraic notation correctly (e.g., Nf3, O-O, exd5)
- Focus on the "why" - explain the purpose of moves
- Avoid meta-commentary ("this is interesting", "one might consider")
- Write in active voice
- Don't repeat information already obvious from the move
${this.config.showEvaluations ? '- Include evaluation numbers when relevant' : '- Omit evaluation numbers, focus on concepts'}
${this.config.includeVariations ? '- Reference key variations when they illustrate the point' : '- Avoid detailed variations'}

Output only the comment text, no formatting or labels.`;
  }

  /**
   * Build the user prompt from input
   */
  buildPrompt(input: NarratorRoleInput): string {
    const { intent, card, previousComments } = input;
    const parts: string[] = [];

    // Move context
    const moveColor = intent.content.isWhiteMove ? 'White' : 'Black';
    parts.push(
      `Move: ${intent.content.moveNumber}${intent.content.isWhiteMove ? '.' : '...'} ${intent.content.move} (${moveColor})`,
    );

    // Intent type
    const intentDesc = getIntentTypeDescription(intent.type);
    parts.push(`\nTask: ${intentDesc}`);

    // Position context from card
    parts.push(
      `\nPosition: Ply ${card.ply}, ${card.sideToMove === 'w' ? 'White' : 'Black'} to move`,
    );
    parts.push(`Criticality: ${card.criticalityScore.toFixed(0)}/100`);

    // Evaluation
    if (card.eval.mate !== undefined) {
      const mateStr = card.eval.mate > 0 ? `+M${card.eval.mate}` : `-M${Math.abs(card.eval.mate)}`;
      parts.push(`Evaluation: ${mateStr}`);
    } else if (card.eval.cp !== undefined) {
      const evalStr =
        card.eval.cp >= 0 ? `+${(card.eval.cp / 100).toFixed(1)}` : (card.eval.cp / 100).toFixed(1);
      parts.push(`Evaluation: ${evalStr}`);
    }

    // Parent delta if significant
    if (card.parentDelta !== undefined) {
      const { winProbChange } = card.parentDelta;
      if (Math.abs(winProbChange) >= 5) {
        const sign = winProbChange > 0 ? '+' : '';
        parts.push(
          `After ${card.parentDelta.move}: ${sign}${winProbChange.toFixed(1)}% win probability`,
        );
      }
    }

    // Best alternative
    if (intent.content.bestAlternative !== undefined) {
      parts.push(`\nBetter alternative: ${intent.content.bestAlternative}`);
    }

    // Theme context
    if (card.themeDeltas.length > 0) {
      const themeStrs = card.themeDeltas.slice(0, 3).map((t) => t.explanation);
      parts.push(`\nThemes: ${themeStrs.join('; ')}`);
    }

    // Line context
    if (card.lineContext.focus !== undefined) {
      parts.push(`\nNarrative focus: ${card.lineContext.focus}`);
    }

    // Recent summary
    if (card.lineContext.recentSummary.length > 0) {
      const recentStr = card.lineContext.recentSummary.slice(-2).join('; ');
      parts.push(`Recent context: ${recentStr}`);
    }

    // Previous comments for style consistency
    if (previousComments.length > 0) {
      const commentsStr = previousComments.slice(-2).join('" "');
      parts.push(`\nPrevious comments (for style reference): "${commentsStr}"`);
    }

    // Length guidance based on intent
    const lengthGuidance = this.getLengthGuidance(intent.suggestedLength);
    parts.push(`\nTarget length: ${lengthGuidance}`);

    return parts.join('\n');
  }

  /**
   * Get length guidance string
   */
  private getLengthGuidance(suggestedLength: 'brief' | 'standard' | 'detailed'): string {
    switch (suggestedLength) {
      case 'brief':
        return '15-25 words';
      case 'standard':
        return '25-40 words';
      case 'detailed':
        return '40-60 words';
    }
  }

  /**
   * Generate fallback comment without LLM
   */
  private generateFallback(intent: CommentIntent, _style: CommentStyle): NarratorRoleResult {
    const comment = this.generateFallbackText(intent);

    return {
      comment,
      tokensUsed: 0,
      confidence: 0.5,
      isFallback: true,
    } as NarratorRoleResult & { isFallback: boolean };
  }

  /**
   * Generate fallback text based on intent type
   */
  private generateFallbackText(intent: CommentIntent): string {
    const moveStr = `${intent.content.moveNumber}${intent.content.isWhiteMove ? '.' : '...'} ${intent.content.move}`;

    switch (intent.type) {
      case 'blunder_explanation':
        return intent.content.bestAlternative !== undefined
          ? `${moveStr} is a mistake. ${intent.content.bestAlternative} was correct.`
          : `${moveStr} is a serious error.`;

      case 'what_was_missed':
        return intent.content.bestAlternative !== undefined
          ? `${intent.content.bestAlternative} was stronger here.`
          : `A better continuation was available.`;

      case 'tactical_shot':
        return intent.content.themeExplanation ?? `${moveStr} creates tactical threats.`;

      case 'theme_emergence':
        return intent.content.themeExplanation ?? `A new strategic theme appears.`;

      case 'theme_resolution':
        return `The previous theme is now resolved.`;

      case 'critical_moment':
        return `Critical moment in the game.`;

      case 'why_this_move':
        return intent.content.themeExplanation ?? `${moveStr} is the best move here.`;

      case 'strategic_plan':
        return intent.content.themeExplanation ?? `This continues the strategic plan.`;

      case 'endgame_technique':
        return `${moveStr} demonstrates proper endgame technique.`;

      case 'human_move':
        return `${moveStr} is the practical choice.`;
    }
  }

  /**
   * Clean up generated comment
   */
  private cleanComment(text: string): string {
    let cleaned = text
      .trim()
      // Remove quotes
      .replace(/^["']|["']$/g, '')
      .trim()
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Ensure ends with punctuation
      .replace(/([^.!?])$/, '$1.');

    // Enforce maximum length (150 chars)
    const maxLength = 150;
    if (cleaned.length > maxLength) {
      const truncated = cleaned.substring(0, maxLength);
      // Try to break at sentence or clause boundary
      const lastPeriod = truncated.lastIndexOf('.');
      const lastSemicolon = truncated.lastIndexOf(';');
      const lastComma = truncated.lastIndexOf(',');
      const breakPoint = Math.max(lastPeriod, lastSemicolon, lastComma);

      if (breakPoint > maxLength * 0.5) {
        // Found a good break point
        cleaned = truncated.substring(0, breakPoint + 1).trim();
      } else {
        // No good break point - truncate at word boundary
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > maxLength * 0.5) {
          cleaned = truncated.substring(0, lastSpace).trim() + '...';
        } else {
          cleaned = truncated.trim() + '...';
        }
      }
    }

    return cleaned;
  }

  /**
   * Estimate confidence in the generated comment
   */
  private estimateConfidence(comment: string, input: NarratorRoleInput): number {
    let confidence = 0.8;

    // Lower confidence for very short comments
    const words = comment.split(/\s+/).length;
    if (words < 10) confidence -= 0.1;
    if (words > 60) confidence -= 0.1;

    // Higher confidence if themes were available
    if (input.card.themeDeltas.length > 0) confidence += 0.1;

    // Lower confidence for low criticality positions
    if (input.card.criticalityScore < 30) confidence -= 0.1;

    return Math.max(0.3, Math.min(1, confidence));
  }

  /**
   * Handle errors from LLM calls
   */
  private handleError(error: unknown): RoleError {
    if (error instanceof CircuitOpenError) {
      return {
        code: 'circuit_open',
        message: 'LLM circuit breaker open',
        useFallback: true,
      };
    }

    if (error instanceof RateLimitError) {
      return {
        code: 'rate_limit',
        message: 'Rate limit reached',
        useFallback: true,
      };
    }

    return {
      code: 'unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      useFallback: true,
    };
  }

  /**
   * Parse LLM response
   *
   * For narrator, the response is just the comment text.
   */
  parseResponse(response: string): { comment: string } {
    return { comment: this.cleanComment(response) };
  }
}

/**
 * Create a narrator role instance
 */
export function createNarratorRole(
  client: OpenAIClient | undefined,
  config?: Partial<NarratorRoleConfig>,
): NarratorRole {
  return new NarratorRole(client, config);
}
