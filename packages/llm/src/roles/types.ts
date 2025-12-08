/**
 * LLM Role Types
 *
 * Defines the narrow LLM roles used for chess annotation:
 * - Narrator: Post-write comment generation
 * - Tiebreaker: Candidate selection when algorithmically ambiguous
 * - Didactic: Audience-aware comment reframing
 */

/**
 * Available LLM roles
 */
export type LLMRole = 'narrator' | 'tiebreaker' | 'didactic';

/**
 * Role configuration for LLM calls
 */
export interface RoleConfig {
  /** Role identifier */
  role: LLMRole;

  /** Model to use (e.g., 'gpt-5-mini') */
  model: string;

  /** Temperature for generation (0-1) */
  temperature: number;

  /** Maximum tokens for response */
  maxTokens: number;

  /** System prompt for the role */
  systemPrompt: string;
}

/**
 * Audience level for didactic adjustments
 */
export type AudienceLevel = 'beginner' | 'club' | 'expert';

/**
 * Comment style for narrator
 */
export type CommentStyle = 'concise' | 'explanatory' | 'didactic';

/**
 * Audience descriptions for prompt context
 */
export const AUDIENCE_DESCRIPTIONS: Record<AudienceLevel, string> = {
  beginner: 'a beginner chess player learning the basics of tactics and strategy',
  club: 'a club-level player (1200-1800 Elo) familiar with common tactics and positional concepts',
  expert: 'an experienced tournament player (1800+ Elo) who understands advanced concepts',
};

/**
 * Style descriptions for prompt context
 */
export const STYLE_DESCRIPTIONS: Record<CommentStyle, string> = {
  concise: 'brief and focused (15-25 words), highlighting the key point',
  explanatory: 'moderately detailed (25-40 words), explaining the reasoning',
  didactic: 'educational (40-60 words), teaching the underlying concept',
};

/**
 * Default narrator role configuration
 */
export const NARRATOR_ROLE_CONFIG: RoleConfig = {
  role: 'narrator',
  model: 'gpt-5-mini',
  temperature: 0.7,
  maxTokens: 150,
  systemPrompt: `You are a chess commentator writing annotations for game analysis.

Guidelines:
- Write clear, instructive comments focused on the key idea
- Use standard algebraic notation correctly (e.g., Nf3, O-O, exd5)
- Focus on the "why" - explain the purpose of moves
- Avoid meta-commentary ("this is interesting", "one might consider")
- Write in active voice
- Match the requested style and length

Output only the comment text, no formatting or labels.`,
};

/**
 * Default tiebreaker role configuration
 */
export const TIEBREAKER_ROLE_CONFIG: RoleConfig = {
  role: 'tiebreaker',
  model: 'gpt-5-mini',
  temperature: 0.3,
  maxTokens: 100,
  systemPrompt: `You are a chess analyst helping decide which line to explore in game analysis.

When candidates are algorithmically close (similar evaluation, similar human probability),
you help decide which is more pedagogically valuable to analyze.

Consider:
- Which line teaches a more useful concept?
- Which line has more instructive follow-up?
- Which line is more likely to be encountered in practice?

Respond with the chosen move in SAN notation and a brief reason (1 sentence).
Format: "MOVE: <san>, REASON: <explanation>"`,
};

/**
 * Default didactic role configuration
 */
export const DIDACTIC_ROLE_CONFIG: RoleConfig = {
  role: 'didactic',
  model: 'gpt-5-mini',
  temperature: 0.5,
  maxTokens: 200,
  systemPrompt: `You are a chess educator adapting annotations for different skill levels.

Your task is to reframe chess comments to be appropriate for the target audience:
- Beginner: Explain all chess terms, avoid jargon, focus on basic concepts
- Club: Assume knowledge of common tactics, explain advanced ideas briefly
- Expert: Use technical language freely, focus on nuances

Preserve the core insight while adjusting vocabulary and detail level.
Output only the reframed comment text.`,
};

/**
 * All role configurations
 */
export const ROLE_CONFIGS: Record<LLMRole, RoleConfig> = {
  narrator: NARRATOR_ROLE_CONFIG,
  tiebreaker: TIEBREAKER_ROLE_CONFIG,
  didactic: DIDACTIC_ROLE_CONFIG,
};

/**
 * Get role configuration with optional overrides
 */
export function getRoleConfig(role: LLMRole, overrides?: Partial<RoleConfig>): RoleConfig {
  return { ...ROLE_CONFIGS[role], ...overrides };
}

/**
 * Base result interface for all roles
 */
export interface RoleResultBase {
  /** Tokens used in generation */
  tokensUsed: number;

  /** Confidence in the result (0-1) */
  confidence: number;

  /** Whether the result is from fallback logic */
  isFallback?: boolean;
}

/**
 * Error from role execution
 */
export interface RoleError {
  /** Error code */
  code: 'rate_limit' | 'circuit_open' | 'timeout' | 'parse_error' | 'unknown';

  /** Error message */
  message: string;

  /** Whether to use fallback */
  useFallback: boolean;
}

/**
 * Check if a result indicates an error
 */
export function isRoleError(result: unknown): result is RoleError {
  return (
    typeof result === 'object' &&
    result !== null &&
    'code' in result &&
    'message' in result &&
    'useFallback' in result
  );
}
