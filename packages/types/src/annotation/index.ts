/**
 * Annotation type exports
 *
 * Types related to move/game annotations (comments, NAGs, variations).
 */

/**
 * Comment type for context-aware validation
 */
export type CommentType = 'initial' | 'variation_start' | 'variation_middle' | 'variation_end';

/**
 * Comment length limits by type
 */
export interface CommentLimits {
  soft: number;
  hard: number;
}

/**
 * Context-aware comment limits
 */
export const COMMENT_LIMITS: Record<CommentType, CommentLimits> = {
  initial: { soft: 75, hard: 150 },
  variation_start: { soft: 50, hard: 100 },
  variation_middle: { soft: 50, hard: 100 },
  variation_end: { soft: 100, hard: 150 },
};

/**
 * Line purpose in explored variation
 */
export type LinePurpose = 'best' | 'human_alternative' | 'refutation' | 'trap' | 'thematic';

/**
 * Source of variation line
 */
export type LineSource = 'engine' | 'maia' | 'llm';

/**
 * Explored variation line
 */
export interface ExploredLine {
  moves: string[];
  annotations?: Record<number, string>;
  purpose: LinePurpose;
  source: LineSource;
}
