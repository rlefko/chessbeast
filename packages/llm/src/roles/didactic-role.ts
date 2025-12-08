/**
 * Didactic Role
 *
 * LLM role for audience-aware comment reframing.
 * Adjusts chess annotations to be appropriate for different skill levels.
 */

import type { AgentCard, DidacticResult } from '../agent-cards/types.js';
import type { OpenAIClient } from '../client/openai-client.js';
import { CircuitOpenError, RateLimitError } from '../errors.js';

import type { RoleConfig, AudienceLevel, RoleError } from './types.js';
import { AUDIENCE_DESCRIPTIONS, getRoleConfig } from './types.js';

/**
 * Didactic role configuration
 */
export interface DidacticRoleConfig {
  /** Base role config overrides */
  roleConfig?: Partial<RoleConfig>;

  /** Minimum comment length to consider reframing */
  minCommentLength: number;

  /** Terms that are always complex for beginners */
  beginnerComplexTerms: string[];

  /** Terms that need explanation for club players */
  clubComplexTerms: string[];
}

/**
 * Common chess terms that may need explanation
 */
export const COMPLEX_CHESS_TERMS = {
  beginner: [
    'fianchetto',
    'zugzwang',
    'zwischenzug',
    'prophylaxis',
    'outpost',
    'battery',
    'discovered attack',
    'deflection',
    'decoy',
    'interference',
    'x-ray',
    'desperado',
    'fortress',
    'perpetual',
    'opposition',
    'triangulation',
    'corresponding squares',
    'pawn break',
    'minority attack',
    'blockade',
  ],
  club: [
    'zugzwang',
    'zwischenzug',
    'prophylaxis',
    'corresponding squares',
    'triangulation',
    'desperado',
  ],
};

/**
 * Default didactic role configuration
 */
export const DEFAULT_DIDACTIC_ROLE_CONFIG: DidacticRoleConfig = {
  minCommentLength: 20,
  beginnerComplexTerms: COMPLEX_CHESS_TERMS.beginner,
  clubComplexTerms: COMPLEX_CHESS_TERMS.club,
};

/**
 * Didactic Role
 *
 * Reframes comments for different audience levels.
 */
export class DidacticRole {
  private readonly config: DidacticRoleConfig;
  private readonly roleConfig: RoleConfig;

  constructor(
    private readonly client: OpenAIClient | undefined,
    private readonly audience: AudienceLevel,
    config: Partial<DidacticRoleConfig> = {},
  ) {
    this.config = { ...DEFAULT_DIDACTIC_ROLE_CONFIG, ...config };
    this.roleConfig = getRoleConfig('didactic', config.roleConfig);
  }

  /**
   * Reframe a comment for the target audience
   */
  async reframe(originalComment: string, context: AgentCard): Promise<DidacticResult | RoleError> {
    // Check if reframing is needed
    if (!this.shouldReframe(originalComment)) {
      return {
        reframedComment: originalComment,
        addedExplanations: [],
        simplifiedTerms: new Map(),
        tokensUsed: 0,
      };
    }

    // If no client, use pattern-based simplification
    if (this.client === undefined) {
      return this.reframePatternBased(originalComment);
    }

    const prompt = this.buildPrompt(originalComment, context);
    const systemPrompt = this.buildSystemPrompt();

    try {
      const response = await this.client.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: this.roleConfig.temperature,
      });

      return this.parseResponse(response.content, originalComment, response.usage?.totalTokens);
    } catch (error) {
      return this.handleError(error, originalComment);
    }
  }

  /**
   * Check if a comment should be reframed
   *
   * Considers comment length and presence of complex terms.
   */
  shouldReframe(comment: string): boolean {
    // Too short to need reframing
    if (comment.length < this.config.minCommentLength) {
      return false;
    }

    // Expert audience doesn't need simplification
    if (this.audience === 'expert') {
      return false;
    }

    // Check for complex terms based on audience
    const complexTerms =
      this.audience === 'beginner'
        ? this.config.beginnerComplexTerms
        : this.config.clubComplexTerms;

    const lowerComment = comment.toLowerCase();
    return complexTerms.some((term) => lowerComment.includes(term.toLowerCase()));
  }

  /**
   * Build the system prompt
   */
  private buildSystemPrompt(): string {
    const audienceDesc = AUDIENCE_DESCRIPTIONS[this.audience];

    return `You are a chess educator adapting annotations for ${audienceDesc}.

Your task is to reframe chess comments while preserving the core insight.

Guidelines for ${this.audience} level:
${this.getAudienceGuidelines()}

Output the reframed comment only, no labels or formatting.
Keep the same approximate length as the original.`;
  }

  /**
   * Get audience-specific guidelines
   */
  private getAudienceGuidelines(): string {
    switch (this.audience) {
      case 'beginner':
        return `- Explain all chess terms (e.g., "fianchetto" → "moving the bishop to the long diagonal")
- Avoid abbreviations (e.g., spell out "knight" instead of "N")
- Focus on concrete moves and immediate consequences
- Use simple cause-and-effect explanations
- Explain why a threat is dangerous`;

      case 'club':
        return `- Assume knowledge of common tactics (pins, forks, skewers)
- Briefly explain advanced concepts if used
- Use standard notation freely
- Focus on the strategic reasoning
- Connect to common opening/endgame patterns`;

      case 'expert':
        return `- Use technical language freely
- Focus on nuances and subtleties
- Reference theoretical concepts by name
- Discuss concrete variations
- Assume deep positional understanding`;
    }
  }

  /**
   * Build the user prompt
   */
  private buildPrompt(comment: string, context: AgentCard): string {
    const parts: string[] = [];

    parts.push(`Original comment: "${comment}"`);

    // Add position context for better reframing
    parts.push(`\nPosition context:`);
    parts.push(`- Ply ${context.ply}, ${context.sideToMove === 'w' ? 'White' : 'Black'} to move`);

    if (context.themeDeltas.length > 0) {
      parts.push(`- Themes: ${context.themeDeltas.map((t) => t.type).join(', ')}`);
    }

    // Identify complex terms
    const complexTerms = this.findComplexTerms(comment);
    if (complexTerms.length > 0) {
      parts.push(`\nTerms that may need explanation: ${complexTerms.join(', ')}`);
    }

    parts.push(`\nReframe this for a ${this.audience} player.`);

    return parts.join('\n');
  }

  /**
   * Find complex terms in a comment
   */
  findComplexTerms(comment: string): string[] {
    const lowerComment = comment.toLowerCase();
    const complexTerms =
      this.audience === 'beginner'
        ? this.config.beginnerComplexTerms
        : this.config.clubComplexTerms;

    return complexTerms.filter((term) => lowerComment.includes(term.toLowerCase()));
  }

  /**
   * Pattern-based reframing without LLM
   */
  private reframePatternBased(comment: string): DidacticResult {
    let reframed = comment;
    const simplifiedTerms = new Map<string, string>();
    const addedExplanations: string[] = [];

    // Simple term replacements for beginners
    if (this.audience === 'beginner') {
      const replacements: [string, string][] = [
        ['fianchetto', 'placing the bishop on the long diagonal'],
        ['zugzwang', 'a position where any move worsens the position'],
        ['prophylaxis', 'a preventive move'],
        ['outpost', 'a strong square for a piece'],
        ['battery', 'two pieces lined up on the same file or diagonal'],
      ];

      for (const [term, replacement] of replacements) {
        const regex = new RegExp(`\\b${term}\\b`, 'gi');
        if (regex.test(reframed)) {
          reframed = reframed.replace(regex, replacement);
          simplifiedTerms.set(term, replacement);
        }
      }
    }

    return {
      reframedComment: reframed,
      addedExplanations,
      simplifiedTerms,
      tokensUsed: 0,
    };
  }

  /**
   * Parse LLM response
   */
  private parseResponse(
    response: string,
    originalComment: string,
    tokensUsed?: number,
  ): DidacticResult {
    const reframedComment = response.trim();

    // Identify what was simplified
    const originalTerms = this.findComplexTerms(originalComment);
    const remainingTerms = this.findComplexTerms(reframedComment);
    const simplifiedTerms = new Map<string, string>();

    for (const term of originalTerms) {
      if (!remainingTerms.includes(term)) {
        // Term was simplified
        simplifiedTerms.set(term, '(simplified in reframe)');
      }
    }

    return {
      reframedComment,
      addedExplanations: [],
      simplifiedTerms,
      tokensUsed: tokensUsed ?? 0,
    };
  }

  /**
   * Handle errors from LLM calls
   */
  private handleError(error: unknown, originalComment: string): DidacticResult | RoleError {
    if (error instanceof CircuitOpenError || error instanceof RateLimitError) {
      // Use pattern-based fallback
      return this.reframePatternBased(originalComment);
    }

    return {
      code: 'unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      useFallback: true,
    };
  }
}

/**
 * Create a didactic role instance
 */
export function createDidacticRole(
  client: OpenAIClient | undefined,
  audience: AudienceLevel,
  config?: Partial<DidacticRoleConfig>,
): DidacticRole {
  return new DidacticRole(client, audience, config);
}

/**
 * Quick check if reframing is needed
 */
export function needsReframing(
  comment: string,
  audience: AudienceLevel,
  config?: Partial<DidacticRoleConfig>,
): boolean {
  const role = new DidacticRole(undefined, audience, config);
  return role.shouldReframe(comment);
}

/**
 * Get complex terms that need explanation for an audience
 */
export function getComplexTermsForAudience(
  comment: string,
  audience: AudienceLevel,
  config?: Partial<DidacticRoleConfig>,
): string[] {
  const role = new DidacticRole(undefined, audience, config);
  return role.findComplexTerms(comment);
}
